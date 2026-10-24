import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { AuditLog, Commission, Conflict, Estate, Lead, Product, Tenant, Touch, User, type TenantDoc } from '../src/models/index.js';
import { createRealtor } from '../src/services/realtors.js';
import { ingestLeadEvent, mergeLeads, overrideAttribution } from '../src/services/attribution.js';
import { recordPayment } from '../src/services/commission.js';
import { normalizePhone } from '../src/lib/phone.js';
import { addDays } from '../src/lib/format.js';

let tenant: TenantDoc;
let tobi: Awaited<ReturnType<typeof createRealtor>>;
let amaka: Awaited<ReturnType<typeof createRealtor>>;
let admin: InstanceType<typeof User>;

async function touch(realtorId: mongoose.Types.ObjectId | null, vid: string, at: Date) {
  return Touch.create({ tenantId: tenant._id, realtorId, type: 'shortlink', channel: 'whatsapp', vid, at, phone: null });
}

async function setModel(model: string, extra: Record<string, unknown> = {}) {
  tenant.set('settings.attribution.model', model);
  for (const [k, v] of Object.entries(extra)) tenant.set(`settings.attribution.${k}`, v);
  await tenant.save();
}

beforeAll(async () => {
  await connectDb({ ephemeral: true });
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all(mongoose.connection.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  tenant = await Tenant.create({ name: 'Test Firm', slug: `test-${Date.now()}` });
  admin = await User.create({ tenantId: tenant._id, role: 'admin', name: 'Admin', email: 'a@test.ng', status: 'active' });
  tobi = await createRealtor({ tenant, name: 'Tobi Adewale', phone: '08061112222', status: 'active', source: 'admin' });
  amaka = await createRealtor({ tenant, name: 'Amaka Eze', phone: '08073334444', status: 'active', source: 'admin' });
});

describe('phone normalisation', () => {
  it('normalises Nigerian formats to +234', () => {
    expect(normalizePhone('08031234567')).toBe('+2348031234567');
    expect(normalizePhone('2348031234567')).toBe('+2348031234567');
    expect(normalizePhone('+234 803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('realtor codes', () => {
  it('generates NAME-### codes and unique slugs', async () => {
    expect(tobi.profile.code).toBe('TOBI-001');
    expect(amaka.profile.code).toBe('AMAKA-002');
    const tobi2 = await createRealtor({ tenant, name: 'Tobi Adewale', phone: '08061113333', status: 'active', source: 'admin' });
    expect(tobi2.profile.slug).toBe('tobi-adewale-2');
  });
});

describe('attribution engine', () => {
  it('credits the first realtor link within the window (default rule)', async () => {
    await touch(tobi.user._id, 'visitor-aaaa1', addDays(new Date(), -3));
    await touch(amaka.user._id, 'visitor-aaaa1', addDays(new Date(), -1));
    const { lead, isNew, decision } = await ingestLeadEvent({ tenant, phone: '08023456789', name: 'Funmi', realtorId: amaka.user._id, vid: 'visitor-aaaa1', eventType: 'form' });
    expect(isNew).toBe(true);
    expect(String(lead.realtorId)).toBe(String(tobi.user._id));
    expect(decision.rule).toBe('first_touch');
    // Amaka's competing claim is recorded, auto-resolved in Tobi's favour
    const conflicts = await Conflict.find({ tenantId: tenant._id, leadId: lead._id });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].status).toBe('auto_resolved');
    expect(conflicts[0].autoDecision).toBe('kept_original');
    expect(lead.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the original realtor when the same phone arrives via another link', async () => {
    const first = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    const second = await ingestLeadEvent({ tenant, phone: '+234 802 345 6789', realtorId: amaka.user._id, eventType: 'whatsapp_click' });
    expect(second.isNew).toBe(false);
    expect(String(second.lead._id)).toBe(String(first.lead._id));
    expect(String(second.lead.realtorId)).toBe(String(tobi.user._id));
    expect(await Lead.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('reassigns once the attribution window has expired', async () => {
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form', at: addDays(new Date(), -120) });
    const { lead, decision } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'form' });
    expect(String(lead.realtorId)).toBe(String(amaka.user._id));
    expect(decision.rule).toBe('window_expired');
    expect(await AuditLog.countDocuments({ tenantId: tenant._id, action: 'attribution.reassign' })).toBe(1);
  });

  it('honours a shorter firm window', async () => {
    await setModel('first_touch', { windowDays: 30 });
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form', at: addDays(new Date(), -45) });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'form' });
    expect(String(lead.realtorId)).toBe(String(amaka.user._id));
  });

  it('last-touch model moves credit to the latest realtor', async () => {
    await setModel('last_touch');
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'form' });
    expect(String(lead.realtorId)).toBe(String(amaka.user._id));
    const c = await Conflict.findOne({ tenantId: tenant._id, leadId: lead._id });
    expect(c?.autoDecision).toBe('moved_to_claimant');
  });

  it('review model opens a conflict for admin review', async () => {
    await setModel('first_touch_review');
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'booking' });
    expect(String(lead.realtorId)).toBe(String(tobi.user._id));
    expect(lead.attribution?.underReview).toBe(true);
    const c = await Conflict.findOne({ tenantId: tenant._id, leadId: lead._id });
    expect(c?.status).toBe('open');
    // repeated claims do not duplicate the open conflict
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'form' });
    expect(await Conflict.countDocuments({ tenantId: tenant._id, leadId: lead._id, status: 'open' })).toBe(1);
  });

  it('assigns leads without a realtor token to House, or round-robin when enabled', async () => {
    const house = await ingestLeadEvent({ tenant, phone: '08023456789', eventType: 'form' });
    expect(house.lead.realtorId).toBeNull();
    expect(house.decision.rule).toBe('house');

    await setModel('first_touch', { houseRoundRobin: true });
    const a = await ingestLeadEvent({ tenant, phone: '08030000001', eventType: 'form' });
    const b = await ingestLeadEvent({ tenant, phone: '08030000002', eventType: 'form' });
    expect(a.decision.rule).toBe('house_round_robin');
    expect(String(a.lead.realtorId)).not.toBe(String(b.lead.realtorId));
  });

  it('lets a realtor claim a House lead', async () => {
    await ingestLeadEvent({ tenant, phone: '08023456789', eventType: 'form' });
    const { lead, decision } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    expect(String(lead.realtorId)).toBe(String(tobi.user._id));
    expect(decision.rule).toBe('claimed_from_house');
  });

  it('ignores links of suspended realtors', async () => {
    tobi.user.status = 'suspended';
    await tobi.user.save();
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    expect(lead.realtorId).toBeNull();
  });

  it('resets the window on a new booking when configured', async () => {
    await setModel('first_touch', { windowReset: 'on_booking' });
    const old = addDays(new Date(), -80);
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form', at: old });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'booking' });
    expect(new Date(lead.attribution!.windowStart!).getTime()).toBeGreaterThan(old.getTime());
    expect(lead.status).toBe('inspection_booked');
  });

  it('rejects a manual lead for an existing buyer owned by someone else', async () => {
    await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    await expect(
      ingestLeadEvent({ tenant, phone: '08023456789', realtorId: amaka.user._id, eventType: 'manual', manualReason: 'walk-in', actorId: admin._id }),
    ).rejects.toThrow(/Override attribution/);
  });

  it('records overrides with reason, audit log and moves unapproved commissions', async () => {
    const estate = await Estate.create({ tenantId: tenant._id, name: 'Oak', slug: 'oak', location: { state: 'Lagos' } });
    const product = await Product.create({ tenantId: tenant._id, estateId: estate._id, name: '300sqm', outrightPrice: 1_000_000 });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    await recordPayment({ tenant, leadId: String(lead._id), amount: 200_000, type: 'deposit', productId: String(product._id), reference: 'REF-1', actorId: admin._id });
    await expect(overrideAttribution({ tenant, leadId: String(lead._id), realtorId: String(amaka.user._id), reason: '', actorId: admin._id, actorRole: 'admin' })).rejects.toThrow(/reason/);
    await overrideAttribution({ tenant, leadId: String(lead._id), realtorId: String(amaka.user._id), reason: 'Amaka brought the client to the office', actorId: admin._id, actorRole: 'admin' });
    const c = await Commission.findOne({ tenantId: tenant._id, leadId: lead._id });
    expect(String(c?.realtorId)).toBe(String(amaka.user._id));
    const log = await AuditLog.findOne({ tenantId: tenant._id, action: 'attribution.override' });
    expect(log?.reason).toMatch(/office/);
  });

  it('merges leads and keeps the primary attribution', async () => {
    const a = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });
    const b = await ingestLeadEvent({ tenant, phone: '08099999999', realtorId: amaka.user._id, eventType: 'form' });
    const merged = await mergeLeads({ tenant, primaryId: String(a.lead._id), secondaryId: String(b.lead._id), reason: 'Same buyer, second SIM', actorId: admin._id, actorRole: 'admin' });
    expect(String(merged.realtorId)).toBe(String(tobi.user._id));
    const secondary = await Lead.findOne({ tenantId: tenant._id, _id: b.lead._id });
    expect(secondary?.status).toBe('merged');
    // The secondary phone can be used again as a fresh identity key? No — it resolves to the active lead only.
    expect(await Lead.countDocuments({ tenantId: tenant._id, status: { $ne: 'merged' } })).toBe(1);
  });
});

describe('commissions', () => {
  it('creates a pending commission on deposit and earns it on full payment', async () => {
    const estate = await Estate.create({ tenantId: tenant._id, name: 'Oak', slug: 'oak', location: { state: 'Lagos' }, commission: { type: 'percent', value: 10 } });
    const product = await Product.create({ tenantId: tenant._id, estateId: estate._id, name: '300sqm', outrightPrice: 5_000_000, plans: [{ name: '6 months', depositAmount: 1_000_000, tenorMonths: 6, monthlyAmount: 700_000 }] });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', realtorId: tobi.user._id, eventType: 'form' });

    const r1 = await recordPayment({ tenant, leadId: String(lead._id), amount: 1_000_000, type: 'deposit', productId: String(product._id), planName: '6 months', reference: 'R1', actorId: admin._id });
    expect(r1.lead.status).toBe('paid_deposit');
    expect(r1.lead.sale?.price).toBe(5_200_000);
    expect(r1.commission?.status).toBe('pending');
    expect(r1.commission?.amount).toBe(520_000); // estate rule 10%

    const r2 = await recordPayment({ tenant, leadId: String(lead._id), amount: 4_200_000, type: 'installment', reference: 'R2', actorId: admin._id });
    expect(r2.lead.status).toBe('completed');
    expect(r2.commission?.status).toBe('earned');
    expect(await Commission.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('pays no commission on House sales', async () => {
    const estate = await Estate.create({ tenantId: tenant._id, name: 'Oak', slug: 'oak', location: { state: 'Lagos' } });
    const product = await Product.create({ tenantId: tenant._id, estateId: estate._id, name: '300sqm', outrightPrice: 1_000_000 });
    const { lead } = await ingestLeadEvent({ tenant, phone: '08023456789', eventType: 'form' });
    const r = await recordPayment({ tenant, leadId: String(lead._id), amount: 1_000_000, type: 'outright', productId: String(product._id), reference: 'R1', actorId: admin._id });
    expect(r.commission).toBeNull();
    expect(r.lead.status).toBe('completed');
  });
});

describe('tenant isolation', () => {
  it('rejects queries on tenant-scoped models without tenantId', async () => {
    await expect(Lead.find({ phone: '+2348023456789' })).rejects.toThrow(/Tenant isolation/);
    await expect(Lead.aggregate([{ $group: { _id: null } }])).rejects.toThrow(/Tenant isolation/);
    await expect(Lead.find({ tenantId: tenant._id })).resolves.toBeDefined();
  });

  it('keeps audit logs immutable', async () => {
    const log = await AuditLog.create({ tenantId: tenant._id, action: 'x', entity: 'y' });
    await expect(AuditLog.updateOne({ _id: log._id }, { action: 'z' })).rejects.toThrow(/immutable/);
    await expect(AuditLog.deleteOne({ _id: log._id })).rejects.toThrow(/immutable/);
  });
});
