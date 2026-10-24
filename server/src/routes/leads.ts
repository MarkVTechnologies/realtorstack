import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Booking, Commission, Conflict, Estate, Lead, LEAD_STATUSES, Payment, PAYMENT_TYPES, Product, RealtorProfile, Touch, User } from '../models/index.js';
import { escapeRegex, pageParams, parse, param, qstr } from '../lib/http.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { normalizePhone } from '../lib/phone.js';
import { can, ctx, isRealtor, requireCap } from '../middleware/auth.js';
import { auditReq } from '../services/audit.js';
import { ingestLeadEvent, mergeLeads, overrideAttribution } from '../services/attribution.js';
import { recordPayment } from '../services/commission.js';
import { notifyRoles } from '../services/notify.js';

export const leadsRouter = Router();

/** Realtors see only their own leads (§8.13). */
function leadFilter(req: Request) {
  const { tenantId, auth } = ctx(req);
  const f: Record<string, unknown> = { tenantId, status: { $ne: 'merged' } };
  if (isRealtor(req)) f.realtorId = auth.userId;
  else if (!can(auth.role, 'leads.all')) throw forbidden();
  return f;
}

async function loadLead(req: Request) {
  const lead = await Lead.findOne({ ...leadFilter(req), status: { $exists: true }, _id: param(req, 'id') });
  if (!lead) throw notFound('Lead');
  return lead;
}

function buildListFilter(req: Request) {
  const f = leadFilter(req);
  const status = qstr(req.query.status);
  if (status) f.status = status;
  const realtor = qstr(req.query.realtorId);
  if (realtor && !isRealtor(req)) f.realtorId = realtor === 'house' ? null : new Types.ObjectId(realtor);
  const estate = qstr(req.query.estateId);
  if (estate) f.estateIds = new Types.ObjectId(estate);
  const source = qstr(req.query.source);
  if (source) f.source = source;
  if (req.query.review === '1') f['attribution.underReview'] = true;
  const from = qstr(req.query.from), to = qstr(req.query.to);
  if (from || to) f.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59+01:00`) } : {}) };
  const q = qstr(req.query.q);
  if (q) {
    const phone = normalizePhone(q);
    f.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }, { phone: phone ?? new RegExp(escapeRegex(q.replace(/^0/, ''))) }];
  }
  return f;
}

async function realtorNames(tenantId: Types.ObjectId, ids: unknown[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const users = await User.find({ tenantId, _id: { $in: unique } }).select('name').lean();
  const profiles = await RealtorProfile.find({ tenantId, userId: { $in: unique } }).select('userId code photoUrl').lean();
  return new Map(users.map((u) => {
    const p = profiles.find((x) => String(x.userId) === String(u._id));
    return [String(u._id), { id: String(u._id), name: u.name, code: p?.code, photoUrl: p?.photoUrl }];
  }));
}

leadsRouter.get('/', async (req, res) => {
  const { tenantId } = ctx(req);
  const f = buildListFilter(req);
  const { page, limit, skip } = pageParams(req);
  const [items, total, counts] = await Promise.all([
    Lead.find(f).sort({ updatedAt: -1 }).skip(skip).limit(limit).select('-evidence -activity -notes').lean(),
    Lead.countDocuments(f),
    Lead.aggregate([{ $match: { ...leadFilter(req) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const names = await realtorNames(tenantId, items.map((l) => l.realtorId));
  const estates = await Estate.find({ tenantId, _id: { $in: items.flatMap((l) => l.estateIds) } }).select('name').lean();
  res.json({
    items: items.map((l) => ({
      ...l,
      realtor: l.realtorId ? names.get(String(l.realtorId)) ?? null : null,
      estates: l.estateIds.map((id) => estates.find((e) => String(e._id) === String(id))?.name).filter(Boolean),
    })),
    total, page, limit,
    statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
});

leadsRouter.get('/export.csv', async (req, res) => {
  const { tenantId } = ctx(req);
  const items = await Lead.find(buildListFilter(req)).sort({ createdAt: -1 }).limit(20000).lean();
  const names = await realtorNames(tenantId, items.map((l) => l.realtorId));
  const estates = await Estate.find({ tenantId }).select('name').lean();
  const rows = items.map((l) => ({
    created: l.createdAt, name: l.name, phone: l.phone, email: l.email, status: l.status, source: l.source,
    realtor: l.realtorId ? names.get(String(l.realtorId))?.name : 'House',
    realtorCode: l.realtorId ? names.get(String(l.realtorId))?.code : '',
    rule: l.attribution?.rule, manual: l.attribution?.manual ? 'manual' : '',
    estates: l.estateIds.map((id) => estates.find((e) => String(e._id) === String(id))?.name).join('; '),
    totalPaid: l.totalPaid,
  }));
  res.type('text/csv').attachment('leads.csv').send(toCsv(rows));
});

leadsRouter.get('/:id', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  const lead = await loadLead(req);
  const [touches, bookings, payments, commissions, conflicts] = await Promise.all([
    Touch.find({ tenantId, leadId: lead._id }).sort({ at: 1 }).limit(500).lean(),
    Booking.find({ tenantId, leadId: lead._id }).sort({ slotAt: -1 }).lean(),
    can(auth.role, 'payments.ledger') || isRealtor(req) ? Payment.find({ tenantId, leadId: lead._id }).sort({ paidAt: -1 }).lean() : [],
    Commission.find({ tenantId, leadId: lead._id, ...(isRealtor(req) ? { realtorId: auth.userId } : {}) }).lean(),
    Conflict.find({ tenantId, leadId: lead._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const o = lead.toObject();
  const names = await realtorNames(tenantId, [
    o.realtorId, ...o.evidence.map((e) => e.realtorId), ...conflicts.flatMap((c) => [c.currentRealtorId, c.claimantRealtorId]),
    ...o.notes.map((n) => n.authorId), ...o.activity.map((a) => a.actorId),
  ]);
  const estates = await Estate.find({ tenantId, _id: { $in: [...o.estateIds, ...bookings.map((b) => b.estateId)] } }).select('name slug').lean();
  const products = await Product.find({ tenantId, estateId: { $in: o.estateIds } }).select('name estateId outrightPrice plans').lean();
  const hideAmounts = isRealtor(req) && !!req.tenant?.settings?.hidePaymentAmountsFromRealtors;
  res.json({
    ...o,
    realtor: o.realtorId ? names.get(String(o.realtorId)) ?? null : null,
    people: Object.fromEntries(names),
    estates,
    products,
    touches,
    bookings,
    payments: hideAmounts ? payments.map((p) => ({ ...p, amount: null })) : payments,
    totalPaid: hideAmounts ? null : o.totalPaid,
    commissions,
    conflicts,
  });
});

leadsRouter.patch('/:id', async (req, res) => {
  const { auth } = ctx(req);
  const lead = await loadLead(req);
  const body = parse(z.object({ status: z.enum(LEAD_STATUSES.filter((s) => s !== 'merged') as [string, ...string[]]).optional(), lostReason: z.string().max(300).optional(), name: z.string().max(120).optional(), email: z.string().email().optional().or(z.literal('')) }), req.body);
  if (!isRealtor(req) && !can(auth.role, 'leads.write')) throw forbidden();
  const before = { status: lead.status };
  if (body.status && body.status !== lead.status) {
    if (body.status === 'lost' && !body.lostReason) throw badRequest('Give a reason for marking the lead lost');
    lead.status = body.status as typeof lead.status;
    lead.activity.push({ at: new Date(), actorId: auth.userId, action: 'status', detail: `${before.status} → ${body.status}${body.lostReason ? ` (${body.lostReason})` : ''}` });
    if (body.lostReason) lead.lostReason = body.lostReason;
  }
  if (body.name !== undefined) lead.name = body.name;
  if (body.email !== undefined) lead.email = body.email || undefined;
  await lead.save();
  if (before.status !== lead.status) await auditReq(req, { action: 'lead.status', entity: 'Lead', entityId: lead._id, before, after: { status: lead.status } });
  res.json(lead);
});

/** LC-05: notes and activity log; realtors log calls and follow-ups. */
leadsRouter.post('/:id/notes', async (req, res) => {
  const { auth } = ctx(req);
  const lead = await loadLead(req);
  const body = parse(z.object({ kind: z.enum(['note', 'call', 'whatsapp', 'meeting', 'email']).default('note'), text: z.string().min(1).max(2000) }), req.body);
  lead.notes.push({ authorId: auth.userId, kind: body.kind, text: body.text, at: new Date() });
  if (lead.status === 'new' && body.kind !== 'note') lead.status = 'contacted';
  await lead.save();
  res.status(201).json(lead.notes.at(-1));
});

/** LC-07: offline lead (walk-in / phone call) registered against a realtor; flagged "manual". */
leadsRouter.post('/manual', async (req, res) => {
  const { tenant, auth } = ctx(req);
  const body = parse(z.object({ phone: z.string(), name: z.string().min(2), email: z.string().email().optional().or(z.literal('')), realtorId: z.string().nullable().optional(), estateId: z.string().optional(), reason: z.string().min(3, 'Give a reason (e.g. walk-in, phone call)').max(300) }), req.body);
  const mode = tenant.settings?.attribution?.manualLeads ?? 'admin_only';
  const realtorRequest = isRealtor(req);
  if (realtorRequest && mode !== 'realtor_request') throw forbidden('Only admins can register offline leads in your firm');
  if (!realtorRequest && !can(auth.role, 'leads.write')) throw forbidden();
  const realtorId = realtorRequest ? auth.userId : body.realtorId ?? null;
  const { lead } = await ingestLeadEvent({
    tenant, phone: body.phone, name: body.name, email: body.email || undefined, realtorId, estateId: body.estateId, eventType: 'manual',
    manualReason: body.reason, actorId: auth.userId, channel: 'other',
  });
  if (realtorRequest) {
    // Realtor-submitted offline leads need admin approval before they count.
    lead.attribution!.underReview = true;
    await lead.save();
    await notifyRoles(tenant, ['owner', 'admin'], { type: 'lead.manual_request', title: 'Offline lead needs approval', body: `${auth.name} registered ${lead.name} (${lead.phone}) as an offline lead: ${body.reason}`, link: `/app/leads/${lead._id}` });
  }
  await auditReq(req, { action: 'lead.manual', entity: 'Lead', entityId: lead._id, after: { realtorId, phone: lead.phone }, reason: body.reason });
  res.status(201).json(lead);
});

leadsRouter.post('/:id/approve-manual', requireCap('attribution.override'), async (req, res) => {
  const lead = await loadLead(req);
  if (!lead.attribution?.manual || !lead.attribution.underReview) throw badRequest('This lead is not awaiting approval');
  lead.attribution.underReview = false;
  await lead.save();
  await auditReq(req, { action: 'lead.manual_approved', entity: 'Lead', entityId: lead._id });
  res.json(lead);
});

leadsRouter.post('/:id/attribution', requireCap('attribution.override'), async (req, res) => {
  const { tenant, auth } = ctx(req);
  const body = parse(z.object({ realtorId: z.string().nullable(), reason: z.string().min(3, 'A reason is required').max(500) }), req.body);
  const lead = await overrideAttribution({ tenant, leadId: param(req, 'id'), realtorId: body.realtorId, reason: body.reason, actorId: auth.userId, actorRole: auth.role });
  res.json(lead);
});

leadsRouter.post('/:id/merge', requireCap('attribution.override'), async (req, res) => {
  const { tenant, auth } = ctx(req);
  const body = parse(z.object({ otherLeadId: z.string(), reason: z.string().min(3).max(500) }), req.body);
  const lead = await mergeLeads({ tenant, primaryId: param(req, 'id'), secondaryId: body.otherLeadId, reason: body.reason, actorId: auth.userId, actorRole: auth.role });
  res.json(lead);
});

/** Manual payment recording in MVP (online payments are Phase 2, PY-01). */
leadsRouter.post('/:id/payments', requireCap('payments.record'), async (req, res) => {
  const { tenant, auth } = ctx(req);
  const body = parse(
    z.object({
      amount: z.number().positive(), type: z.enum(PAYMENT_TYPES), productId: z.string().optional(), planName: z.string().optional(),
      reference: z.string().min(3).max(80), paidAt: z.coerce.date().optional(), provider: z.enum(['manual', 'bank_transfer']).default('bank_transfer'), note: z.string().max(300).optional(),
    }),
    req.body,
  );
  const result = await recordPayment({ tenant, leadId: param(req, 'id'), ...body, actorId: auth.userId, actorRole: auth.role });
  res.status(201).json(result);
});
