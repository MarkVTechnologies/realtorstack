import { Router } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { Conflict, Lead, RealtorProfile, Touch, User } from '../models/index.js';
import { parse, param, qstr } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ctx, requireCap } from '../middleware/auth.js';
import { overrideAttribution } from '../services/attribution.js';
import { auditReq } from '../services/audit.js';
import { notifyUsers } from '../services/notify.js';

export const conflictsRouter = Router();

/** AC-03: conflict queue with the full evidence trail. */
conflictsRouter.get('/', requireCap('leads.all'), async (req, res) => {
  const { tenantId } = ctx(req);
  const status = (qstr(req.query.status) ?? 'open') as 'open' | 'auto_resolved' | 'resolved';
  const items = await Conflict.find({ tenantId, status }).sort({ createdAt: -1 }).limit(200).lean();
  const leads = await Lead.find({ tenantId, _id: { $in: items.map((c) => c.leadId) } }).select('name phone status realtorId evidence attribution createdAt').lean();
  const realtorIds = items.flatMap((c) => [c.currentRealtorId, c.claimantRealtorId]).concat(leads.flatMap((l) => l.evidence.map((e) => e.realtorId))).filter(Boolean) as Types.ObjectId[];
  const [users, profiles] = await Promise.all([
    User.find({ tenantId, _id: { $in: realtorIds } }).select('name').lean(),
    RealtorProfile.find({ tenantId, userId: { $in: realtorIds } }).select('userId code').lean(),
  ]);
  const person = (id: unknown) => {
    if (!id) return null;
    const u = users.find((x) => String(x._id) === String(id));
    return u ? { id: String(u._id), name: u.name, code: profiles.find((p) => String(p.userId) === String(id))?.code } : null;
  };
  const counts = await Conflict.aggregate([{ $match: { tenantId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    items: items.map((c) => {
      const lead = leads.find((l) => String(l._id) === String(c.leadId));
      return {
        ...c,
        current: person(c.currentRealtorId),
        claimant: person(c.claimantRealtorId),
        lead: lead ? { id: String(lead._id), name: lead.name, phone: lead.phone, status: lead.status, realtor: person(lead.realtorId), windowStart: lead.attribution?.windowStart, createdAt: lead.createdAt } : null,
        timeline: (lead?.evidence ?? []).map((e) => ({ ...e, realtor: person(e.realtorId) })),
      };
    }),
  });
});

/** Flow 12.4: admin confirms the original attribution or overrides it with a reason; both realtors see the decision. */
conflictsRouter.post('/:id/resolve', requireCap('attribution.override'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const body = parse(z.object({ realtorId: z.string().nullable(), reason: z.string().min(3, 'A reason is required').max(500) }), req.body);
  const c = await Conflict.findOne({ tenantId, _id: param(req, 'id') });
  if (!c) throw notFound('Conflict');
  if (c.status === 'resolved') throw badRequest('This conflict is already resolved');
  const lead = await Lead.findOne({ tenantId, _id: c.leadId });
  if (!lead) throw notFound('Lead');

  if (String(lead.realtorId ?? '') !== String(body.realtorId ?? '')) {
    await overrideAttribution({ tenant, leadId: String(lead._id), realtorId: body.realtorId, reason: body.reason, actorId: auth.userId, actorRole: auth.role, rule: 'conflict_resolution' });
  } else {
    lead.attribution!.underReview = false;
    lead.evidence.push({ at: new Date(), type: 'conflict_confirmed', realtorId: lead.realtorId ?? null, note: body.reason });
    lead.activity.push({ at: new Date(), actorId: auth.userId, action: 'attribution.confirmed', detail: body.reason });
    await lead.save();
    await auditReq(req, { action: 'attribution.confirm', entity: 'Lead', entityId: lead._id, after: { realtorId: lead.realtorId }, reason: body.reason });
  }
  c.status = 'resolved';
  c.set('resolution', { realtorId: body.realtorId, reason: body.reason, by: auth.userId, at: new Date() });
  await c.save();
  // Close sibling conflicts on the same lead too
  await Conflict.updateMany({ tenantId, leadId: lead._id, status: 'open' }, { $set: { status: 'resolved', resolution: c.resolution } });
  await notifyUsers({
    tenant, userIds: [c.currentRealtorId, c.claimantRealtorId], type: 'conflict.resolved', title: 'Attribution dispute resolved',
    body: `The dispute over ${lead.name || lead.phone} was resolved. Reason: ${body.reason}`, link: `/app/leads/${lead._id}`,
  });
  res.json({ ok: true });
});

/** Evidence touches for a conflict (links clicked, timestamps, channels). */
conflictsRouter.get('/:id/touches', requireCap('leads.all'), async (req, res) => {
  const { tenantId } = ctx(req);
  const c = await Conflict.findOne({ tenantId, _id: param(req, 'id') }).lean();
  if (!c) throw notFound('Conflict');
  res.json(await Touch.find({ tenantId, leadId: c.leadId }).sort({ at: 1 }).lean());
});
