import { Types } from 'mongoose';
import {
  Lead, Touch, Conflict, User, RealtorProfile, Commission, Payment, Estate,
  STATUS_RANK, CHANNELS, type LeadDoc, type TenantDoc, type TouchDoc, type LeadStatus,
} from '../models/index.js';
import { normalizePhone } from '../lib/phone.js';
import { badRequest, conflict as conflictError, notFound } from '../lib/errors.js';
import { audit } from './audit.js';
import { notifyRoles, notifyUsers } from './notify.js';

/*
 * Attribution engine — PRD §9.
 *
 * Default rule: the realtor whose link the buyer FIRST used gets credit, provided the buyer
 * converts within the attribution window. The buyer's identity is their phone number.
 *
 *  1. Every link open records a Touch keyed by a first-party visitor id (vid).
 *  2. When the visitor identifies themselves (form, WhatsApp, booking) their phone becomes the
 *     identity key; all of the visitor's anonymous touches are bound to that phone.
 *  3. New identity → the winning touch inside the window decides the realtor (first or last
 *     touch per firm setting). No realtor touch → "House" (optionally round-robin).
 *  4. Known identity + another realtor's touch → the original realtor is kept unless the window
 *     expired (or the firm uses last-touch). The competing claim is always recorded and shows
 *     up in the conflict queue (open for review, or auto-resolved with the decision).
 */

export type LeadEventType = 'form' | 'whatsapp_click' | 'booking' | 'manual';

export interface LeadEventInput {
  tenant: TenantDoc;
  phone: string;
  email?: string;
  name?: string;
  realtorId?: Types.ObjectId | string | null;
  vid?: string;
  channel?: string;
  estateId?: Types.ObjectId | string | null;
  productId?: Types.ObjectId | string | null;
  eventType: LeadEventType;
  message?: string;
  preferredContactTime?: string;
  consent?: boolean;
  actorId?: Types.ObjectId | null;
  manualReason?: string;
  ipHash?: string;
  userAgent?: string;
  path?: string;
  at?: Date;
}

export interface AttributionDecision {
  realtorId: Types.ObjectId | null;
  rule: string;
  changed: boolean;
  conflictId?: Types.ObjectId;
}

const DAY = 86_400_000;
const oid = (v: Types.ObjectId | string | null | undefined) => (v ? new Types.ObjectId(String(v)) : null);
const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

function settingsOf(tenant: TenantDoc) {
  const a = tenant.settings?.attribution;
  return {
    model: (a?.model ?? 'first_touch') as 'first_touch' | 'last_touch' | 'first_touch_review',
    windowMs: (a?.windowDays ?? 90) * DAY,
    identityKey: a?.identityKey ?? 'phone',
    windowReset: a?.windowReset ?? 'never',
    houseRoundRobin: !!a?.houseRoundRobin,
  };
}

/** Only active realtors of this firm can hold attribution. */
async function activeRealtorIds(tenantId: Types.ObjectId, ids: (Types.ObjectId | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Set<string>();
  const users = await User.find({ _id: { $in: unique }, tenantId, role: 'realtor', status: 'active' }).select('_id').lean();
  return new Set(users.map((u) => String(u._id)));
}

async function pickRoundRobin(tenantId: Types.ObjectId) {
  const active = await User.find({ tenantId, role: 'realtor', status: 'active' }).select('_id').lean();
  if (!active.length) return null;
  const profile = await RealtorProfile.findOne({ tenantId, userId: { $in: active.map((u) => u._id) } }).sort({ lastAssignedAt: 1, createdAt: 1 });
  if (!profile) return null;
  profile.lastAssignedAt = new Date();
  await profile.save();
  return profile.userId as Types.ObjectId;
}

function evidenceFrom(t: TouchDoc, note?: string) {
  return { at: t.at, type: t.type, realtorId: t.realtorId ?? null, touchId: t._id, channel: t.channel ?? undefined, estateId: t.estateId ?? undefined, note };
}

function bumpStatus(lead: LeadDoc, to: LeadStatus) {
  const current = lead.status as LeadStatus;
  if (current === 'lost' || current === 'merged') return;
  if (STATUS_RANK[to] > STATUS_RANK[current]) lead.status = to;
}

async function openConflict(params: {
  tenant: TenantDoc; lead: LeadDoc; claimantId: Types.ObjectId; touchIds: Types.ObjectId[];
  model: string; review: boolean; autoDecision: 'kept_original' | 'moved_to_claimant' | null; previousRealtorId: Types.ObjectId | null;
}) {
  const { tenant, lead, claimantId, touchIds, model, review, autoDecision, previousRealtorId } = params;
  const existing = await Conflict.findOne({ tenantId: tenant._id, leadId: lead._id, claimantRealtorId: claimantId, status: 'open' });
  if (existing) {
    existing.touchIds.push(...touchIds);
    await existing.save();
    return existing;
  }
  const c = await Conflict.create({
    tenantId: tenant._id,
    leadId: lead._id,
    currentRealtorId: previousRealtorId,
    claimantRealtorId: claimantId,
    model,
    status: review ? 'open' : 'auto_resolved',
    autoDecision: review ? null : autoDecision,
    touchIds,
  });
  if (review) {
    await notifyRoles(tenant, ['owner', 'admin'], {
      type: 'conflict.opened',
      title: 'Attribution conflict needs review',
      body: `Two realtors have a valid claim on lead ${lead.name || lead.phone}. Review the evidence and decide.`,
      link: `/app/conflicts`,
    });
  }
  return c;
}

/**
 * Ingests a lead event (form submission, WhatsApp click with phone, booking, manual entry),
 * creating or updating the lead and applying the firm's attribution rules.
 */
export async function ingestLeadEvent(input: LeadEventInput): Promise<{ lead: LeadDoc; isNew: boolean; decision: AttributionDecision }> {
  const { tenant } = input;
  const tenantId = tenant._id;
  const s = settingsOf(tenant);
  const now = input.at ?? new Date();
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest('Please enter a valid Nigerian phone number');
  const email = input.email?.trim().toLowerCase() || undefined;

  let realtorId = oid(input.realtorId);
  if (realtorId) {
    const ok = await activeRealtorIds(tenantId, [realtorId]);
    if (!ok.has(String(realtorId))) {
      if (input.eventType === 'manual') throw badRequest('Leads can only be registered against an active realtor');
      realtorId = null; // inactive realtor's link → House
    }
  }

  const estateId = oid(input.estateId);
  if (estateId && !(await Estate.exists({ tenantId, _id: estateId }))) throw badRequest('Unknown estate');

  // Find the existing identity (de-duplication by phone, optionally email — LC-03 / §9.3)
  const or: Record<string, unknown>[] = [{ phone }];
  if (s.identityKey === 'phone_email' && email) or.push({ email });
  let lead = await Lead.findOne({ tenantId, status: { $ne: 'merged' }, $or: or }).sort({ createdAt: 1 });

  if (input.eventType === 'manual' && lead && !same(lead.realtorId, realtorId)) {
    throw conflictError('This buyer already exists as a lead. Use "Override attribution" on the lead instead, so the change is audit-logged.');
  }

  // 1. Record the event itself as a touch.
  const eventTouch = await Touch.create({
    tenantId,
    realtorId,
    estateId,
    type: input.eventType,
    channel: (input.channel ?? 'direct') as (typeof CHANNELS)[number],
    vid: input.vid,
    phone,
    path: input.path,
    ipHash: input.ipHash,
    userAgent: input.userAgent?.slice(0, 200),
    at: now,
  });

  // 2. Bind this visitor's anonymous touches to the identity (§9.2).
  if (input.vid) {
    await Touch.updateMany({ tenantId, vid: input.vid, phone: null }, { $set: { phone } });
  }

  const isNew = !lead;
  let decision: AttributionDecision;
  const conflictsToOpen: Parameters<typeof openConflict>[0][] = [];

  if (!lead) {
    // ---- New identity -------------------------------------------------------------------------
    const windowStart = new Date(now.getTime() - s.windowMs);
    const touches = await Touch.find({ tenantId, phone, leadId: null, at: { $gte: windowStart, $lte: now } }).sort({ at: 1 });
    const active = await activeRealtorIds(tenantId, touches.map((t) => t.realtorId));
    const realtorTouches = touches.filter((t) => t.realtorId && active.has(String(t.realtorId)));

    let winner: TouchDoc | undefined;
    let rule: string;
    let assigned: Types.ObjectId | null = null;
    if (input.eventType === 'manual') {
      winner = eventTouch;
      assigned = realtorId;
      rule = 'manual';
    } else if (realtorTouches.length) {
      winner = s.model === 'last_touch' ? realtorTouches[realtorTouches.length - 1] : realtorTouches[0];
      assigned = winner.realtorId as Types.ObjectId;
      rule = s.model === 'last_touch' ? 'last_touch' : 'first_touch';
    } else if (s.houseRoundRobin) {
      assigned = await pickRoundRobin(tenantId);
      rule = assigned ? 'house_round_robin' : 'house';
    } else {
      rule = 'house';
    }

    lead = new Lead({
      tenantId,
      phone,
      email,
      name: input.name?.trim() ?? '',
      realtorId: assigned,
      attribution: {
        model: s.model,
        rule,
        touchId: winner?._id,
        windowStart: winner?.at ?? now,
        decidedAt: now,
        manual: input.eventType === 'manual',
        manualReason: input.manualReason,
      },
      evidence: touches.map((t) => evidenceFrom(t, t._id.equals(winner?._id ?? '') ? 'winning touch' : undefined)),
      source: input.eventType === 'whatsapp_click' ? 'whatsapp' : input.eventType,
      estateIds: estateId ? [estateId] : [],
      productId: oid(input.productId) ?? undefined,
      preferredContactTime: input.preferredContactTime,
      message: input.message,
      consentAt: input.consent ? now : undefined,
      activity: [{ at: now, actorId: input.actorId ?? null, action: `created:${input.eventType}`, detail: rule }],
      createdAt: now,
    });
    if (input.eventType === 'booking') bumpStatus(lead, 'inspection_booked');
    await lead.save();
    await Touch.updateMany({ tenantId, phone, leadId: null }, { $set: { leadId: lead._id } });

    // Other realtors who touched this buyer inside the window have a competing claim.
    const others = [...new Set(realtorTouches.map((t) => String(t.realtorId)))].filter((r) => !same(r, assigned));
    for (const other of others) {
      conflictsToOpen.push({
        tenant, lead, claimantId: new Types.ObjectId(other),
        touchIds: realtorTouches.filter((t) => same(t.realtorId, other)).map((t) => t._id),
        model: s.model, review: s.model === 'first_touch_review' && !!assigned, autoDecision: 'kept_original', previousRealtorId: assigned,
      });
    }
    if (conflictsToOpen.some((c) => c.review)) lead.attribution!.underReview = true;
    decision = { realtorId: assigned, rule, changed: true };

    if (assigned) await RealtorProfile.updateOne({ tenantId, userId: assigned }, { $set: { lastLeadAt: now } });
    await audit({ tenantId, actorId: input.actorId ?? null, action: 'attribution.assign', entity: 'Lead', entityId: lead._id, after: { realtorId: assigned, rule, touchId: winner?._id }, reason: input.manualReason });
  } else {
    // ---- Known identity ----------------------------------------------------------------------
    const unbound = await Touch.find({ tenantId, phone, leadId: null }).sort({ at: 1 });
    for (const t of unbound) lead.evidence.push(evidenceFrom(t));
    await Touch.updateMany({ tenantId, _id: { $in: unbound.map((t) => t._id) } }, { $set: { leadId: lead._id } });

    const current = (lead.realtorId as Types.ObjectId | null) ?? null;
    const active = await activeRealtorIds(tenantId, unbound.map((t) => t.realtorId));
    const claimTouches = unbound.filter((t) => t.realtorId && active.has(String(t.realtorId)) && !same(t.realtorId, current));
    // The claimant is the realtor behind this event, else the most recent competing touch.
    const claimant = (realtorId && !same(realtorId, current) ? realtorId : (claimTouches.at(-1)?.realtorId as Types.ObjectId | undefined)) ?? null;
    decision = { realtorId: current, rule: lead.attribution?.rule ?? 'first_touch', changed: false };

    if (claimant) {
      const windowStart = lead.attribution?.windowStart ?? lead.createdAt;
      const expired = now.getTime() - new Date(windowStart).getTime() > s.windowMs;
      const touchIds = claimTouches.filter((t) => same(t.realtorId, claimant)).map((t) => t._id);
      const claimTouch = claimTouches.filter((t) => same(t.realtorId, claimant)).at(-1) ?? eventTouch;
      const reassign = async (rule: string) => {
        const before = { realtorId: current, rule: lead!.attribution?.rule };
        lead!.realtorId = claimant;
        lead!.attribution = { ...(lead!.attribution ?? {}), model: s.model, rule, touchId: claimTouch._id, windowStart: claimTouch.at, decidedAt: now, underReview: false, manual: false };
        lead!.activity.push({ at: now, actorId: null, action: 'attribution.reassigned', detail: rule });
        decision = { realtorId: claimant, rule, changed: true };
        await audit({ tenantId, action: 'attribution.reassign', entity: 'Lead', entityId: lead!._id, before, after: { realtorId: claimant, rule } });
        await notifyUsers({
          tenant, userIds: [current], type: 'attribution.lost', title: 'A lead was re-attributed',
          body: `Lead ${lead!.name || lead!.phone} is now credited to another realtor (${rule.replace('_', ' ')}).`, link: '/app/leads',
        });
      };

      if (!current) {
        await reassign('claimed_from_house');
      } else if (expired) {
        await reassign('window_expired');
      } else if (s.model === 'last_touch') {
        await reassign('last_touch');
        conflictsToOpen.push({ tenant, lead, claimantId: claimant, touchIds, model: s.model, review: false, autoDecision: 'moved_to_claimant', previousRealtorId: current });
      } else {
        const review = s.model === 'first_touch_review';
        if (review) lead.attribution!.underReview = true;
        conflictsToOpen.push({ tenant, lead, claimantId: claimant, touchIds, model: s.model, review, autoDecision: 'kept_original', previousRealtorId: current });
      }
    } else if (input.eventType === 'booking' && s.windowReset === 'on_booking' && current && same(realtorId, current)) {
      lead.attribution!.windowStart = now;
      lead.evidence.push({ at: now, type: 'window_reset', realtorId: current, note: 'Attribution window reset by new inspection booking' });
    }

    if (input.name && !lead.name) lead.name = input.name.trim();
    if (email && !lead.email) lead.email = email;
    if (estateId && !lead.estateIds.some((e) => same(e, estateId))) lead.estateIds.push(estateId);
    if (input.productId) lead.productId = oid(input.productId)!;
    if (input.message) lead.message = input.message;
    if (input.preferredContactTime) lead.preferredContactTime = input.preferredContactTime;
    if (input.consent && !lead.consentAt) lead.consentAt = now;
    lead.activity.push({ at: now, actorId: input.actorId ?? null, action: `event:${input.eventType}`, detail: input.message?.slice(0, 140) });
    if (input.eventType === 'booking') bumpStatus(lead, 'inspection_booked');
    await lead.save();
  }

  for (const c of conflictsToOpen) {
    const created = await openConflict(c);
    decision.conflictId = created._id;
  }
  if (conflictsToOpen.length) await lead.save();

  // Notify whoever owns the lead now (LC-06). House leads go to sales staff.
  const label = lead.name || lead.phone;
  const kind = input.eventType === 'booking' ? 'booked an inspection' : input.eventType === 'whatsapp_click' ? 'started a WhatsApp chat' : isNew ? 'sent an enquiry' : 'enquired again';
  if (input.eventType !== 'manual') {
    if (lead.realtorId) {
      await notifyUsers({ tenant, userIds: [lead.realtorId], type: isNew ? 'lead.new' : 'lead.activity', title: isNew ? `New lead: ${label}` : `${label} ${kind}`, body: `${label} ${kind}. Follow up quickly — fast responses convert.`, link: `/app/leads/${lead._id}` });
    } else {
      await notifyRoles(tenant, ['admin', 'sales_manager'], { type: 'lead.house', title: `New house lead: ${label}`, body: `${label} ${kind} with no realtor link. Assign it to a realtor if needed.`, link: `/app/leads/${lead._id}` });
    }
  }

  return { lead, isNew, decision };
}

/** AC-04: admin override with a mandatory reason; audit-logged and visible to affected realtors. */
export async function overrideAttribution(params: {
  tenant: TenantDoc; leadId: string; realtorId: string | null; reason: string; actorId: Types.ObjectId; actorRole: string; rule?: string;
}) {
  const { tenant, reason, actorId, actorRole } = params;
  if (!reason?.trim()) throw badRequest('A reason is required to override attribution');
  const lead = await Lead.findOne({ tenantId: tenant._id, _id: params.leadId });
  if (!lead) throw notFound('Lead');
  const newRealtor = oid(params.realtorId);
  if (newRealtor) {
    const ok = await activeRealtorIds(tenant._id, [newRealtor]);
    if (!ok.has(String(newRealtor))) throw badRequest('Attribution can only be given to an active realtor');
  }
  const previous = (lead.realtorId as Types.ObjectId | null) ?? null;
  const now = new Date();
  const rule = params.rule ?? 'override';

  lead.realtorId = newRealtor;
  lead.attribution = { ...(lead.attribution ?? {}), rule, decidedAt: now, windowStart: lead.attribution?.windowStart ?? now, underReview: false, manual: lead.attribution?.manual ?? false };
  lead.evidence.push({ at: now, type: 'override', realtorId: newRealtor, note: reason });
  lead.activity.push({ at: now, actorId, action: 'attribution.override', detail: reason });
  await lead.save();

  await Conflict.updateMany(
    { tenantId: tenant._id, leadId: lead._id, status: 'open' },
    { $set: { status: 'resolved', resolution: { realtorId: newRealtor, reason, by: actorId, at: now } } },
  );

  if (!same(previous, newRealtor)) {
    // Unapproved commissions follow the corrected attribution; approved/paid ones are settled history.
    await Commission.updateMany({ tenantId: tenant._id, leadId: lead._id, status: { $in: ['pending', 'earned'] } }, { $set: { realtorId: newRealtor } });
    if (!newRealtor) await Commission.updateMany({ tenantId: tenant._id, leadId: lead._id, status: { $in: ['pending', 'earned'] } }, { $set: { status: 'void' } });
    await Payment.updateMany({ tenantId: tenant._id, leadId: lead._id }, { $set: { realtorId: newRealtor } });
  }

  await audit({ tenantId: tenant._id, actorId, actorRole, action: 'attribution.override', entity: 'Lead', entityId: lead._id, before: { realtorId: previous }, after: { realtorId: newRealtor, rule }, reason });
  await notifyUsers({
    tenant, userIds: [previous, newRealtor], type: 'attribution.override', title: 'Attribution decision on a lead',
    body: `Lead ${lead.name || lead.phone} has been ${newRealtor ? 'credited to a realtor' : 'assigned to the firm (House)'} by an admin. Reason: ${reason}`,
    link: `/app/leads/${lead._id}`,
  });
  return lead;
}

/** §9.4: buyer used a different phone — admin merges `secondaryId` into `primaryId`. */
export async function mergeLeads(params: { tenant: TenantDoc; primaryId: string; secondaryId: string; reason: string; actorId: Types.ObjectId; actorRole: string }) {
  const { tenant, reason, actorId, actorRole } = params;
  if (!reason?.trim()) throw badRequest('A reason is required to merge leads');
  if (params.primaryId === params.secondaryId) throw badRequest('Cannot merge a lead into itself');
  const [primary, secondary] = await Promise.all([
    Lead.findOne({ tenantId: tenant._id, _id: params.primaryId }),
    Lead.findOne({ tenantId: tenant._id, _id: params.secondaryId }),
  ]);
  if (!primary || !secondary) throw notFound('Lead');
  if (primary.status === 'merged' || secondary.status === 'merged') throw badRequest('Lead was already merged');
  const now = new Date();
  const { Booking } = await import('../models/index.js');

  await Promise.all([
    Touch.updateMany({ tenantId: tenant._id, leadId: secondary._id }, { $set: { leadId: primary._id } }),
    Booking.updateMany({ tenantId: tenant._id, leadId: secondary._id }, { $set: { leadId: primary._id } }),
    Payment.updateMany({ tenantId: tenant._id, leadId: secondary._id }, { $set: { leadId: primary._id } }),
    Commission.updateMany({ tenantId: tenant._id, leadId: secondary._id }, { $set: { leadId: primary._id } }),
    Conflict.updateMany({ tenantId: tenant._id, leadId: secondary._id }, { $set: { leadId: primary._id } }),
  ]);

  primary.evidence.push(...secondary.evidence, { at: now, type: 'merge', realtorId: secondary.realtorId ?? null, note: `Merged ${secondary.phone}: ${reason}` });
  primary.evidence.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  primary.notes.push(...secondary.notes);
  primary.activity.push({ at: now, actorId, action: 'lead.merged', detail: `${secondary.phone} — ${reason}` });
  for (const e of secondary.estateIds) if (!primary.estateIds.some((x) => same(x, e))) primary.estateIds.push(e);
  if (!primary.email && secondary.email) primary.email = secondary.email;
  primary.totalPaid = (primary.totalPaid ?? 0) + (secondary.totalPaid ?? 0);
  if (STATUS_RANK[secondary.status as LeadStatus] > STATUS_RANK[primary.status as LeadStatus]) primary.status = secondary.status;
  if (!primary.sale?.productId && secondary.sale?.productId) primary.sale = secondary.sale;

  secondary.status = 'merged';
  secondary.mergedInto = primary._id;
  secondary.activity.push({ at: now, actorId, action: 'lead.merged_into', detail: String(primary._id) });
  await secondary.save();
  await primary.save();

  await audit({ tenantId: tenant._id, actorId, actorRole, action: 'lead.merge', entity: 'Lead', entityId: primary._id, before: { secondary: secondary._id, secondaryRealtor: secondary.realtorId }, after: { primary: primary._id, realtorId: primary.realtorId }, reason });
  if (!same(primary.realtorId, secondary.realtorId)) {
    await notifyUsers({ tenant, userIds: [primary.realtorId, secondary.realtorId], type: 'lead.merged', title: 'Two leads were merged', body: `Leads ${primary.phone} and ${secondary.phone} were merged by an admin. Reason: ${reason}`, link: `/app/leads/${primary._id}` });
  }
  return primary;
}
