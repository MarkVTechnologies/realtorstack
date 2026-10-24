import { Router } from 'express';
import { z } from 'zod';
import { AbuseReport, Estate, Lead, MessageLog, PLANS, Tenant, User } from '../models/index.js';
import { parse, param, qstr, escapeRegex } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { uniqueSlug } from '../lib/slug.js';
import { auditReq } from '../services/audit.js';
import { createInvite, deliverInvite, firmSiteUrl } from '../services/realtors.js';
import { revalidateFirm } from '../services/revalidate.js';
import { addDays } from '../lib/format.js';

/** Platform super-admin (§8.14). All queries here are intentionally cross-tenant. */
export const adminRouter = Router();

adminRouter.get('/overview', async (_req, res) => {
  const since = addDays(new Date(), -30);
  const [tenants, activeTenants, realtors, leads30, failedMessages, openReports] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: 'active' }),
    User.countDocuments({ role: 'realtor', status: 'active' }),
    Lead.countDocuments({ createdAt: { $gte: since } }).setOptions({ crossTenant: true }),
    MessageLog.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
    AbuseReport.countDocuments({ status: 'open' }),
  ]);
  res.json({ tenants, activeTenants, realtors, leads30, failedMessages, openReports });
});

adminRouter.get('/tenants', async (req, res) => {
  const q = qstr(req.query.q);
  const tenants = await Tenant.find(q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { slug: new RegExp(escapeRegex(q), 'i') }] } : {}).sort({ createdAt: -1 }).lean();
  const ids = tenants.map((t) => t._id);
  const since = addDays(new Date(), -30);
  const [realtors, estates, leads] = await Promise.all([
    User.aggregate([{ $match: { tenantId: { $in: ids }, role: 'realtor', status: 'active' } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
    Estate.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { tenantId: { $in: ids }, createdAt: { $gte: since } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
  ]);
  const n = (rows: { _id: unknown; n: number }[], id: unknown) => rows.find((r) => String(r._id) === String(id))?.n ?? 0;
  res.json(tenants.map((t) => ({
    id: String(t._id), name: t.name, slug: t.slug, plan: t.plan, status: t.status, billing: t.billing, createdAt: t.createdAt, cacNumber: t.cacNumber,
    siteUrl: firmSiteUrl(t.slug), activeRealtors: n(realtors, t._id), estates: n(estates, t._id), leads30: n(leads, t._id),
  })));
});

/** Pilot: Mark V creates the workspace and invites the owner (flow 12.1). */
adminRouter.post('/tenants', async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Lowercase letters, numbers and dashes').optional(),
      ownerName: z.string().min(2), ownerEmail: z.string().email(), plan: z.enum(PLANS).default('pilot'), cacNumber: z.string().optional(),
    }),
    req.body,
  );
  const slug = body.slug ?? (await uniqueSlug(body.name, async (s) => !!(await Tenant.exists({ slug: s }))));
  if (await Tenant.exists({ slug })) throw badRequest('That workspace slug is taken');
  const tenant = await Tenant.create({ name: body.name, slug, plan: body.plan, cacNumber: body.cacNumber, registration: { code: randomToken(9), enabled: true, requireApproval: true } });
  const owner = await User.create({ tenantId: tenant._id, role: 'owner', name: body.ownerName, email: body.ownerEmail.toLowerCase(), status: 'invited' });
  const invite = await createInvite(tenant._id, owner._id, req.auth!.userId);
  await deliverInvite(tenant, owner, invite.url);
  await auditReq(req, { tenantId: tenant._id, action: 'platform.tenant_create', entity: 'Tenant', entityId: tenant._id, after: { name: tenant.name, slug, plan: body.plan } });
  res.status(201).json({ id: String(tenant._id), slug, ownerInviteUrl: invite.url });
});

/** SA-01 / SA-03: plan, billing status, suspension for abuse or non-payment. */
adminRouter.patch('/tenants/:id', async (req, res) => {
  const body = parse(
    z.object({
      plan: z.enum(PLANS).optional(),
      status: z.enum(['active', 'suspended', 'paused']).optional(),
      suspendedReason: z.string().max(300).optional(),
      billing: z.object({ status: z.enum(['pilot', 'invoiced', 'paid', 'overdue']), seatLimit: z.number().int().min(0), monthlyFee: z.number().min(0), notes: z.string().max(1000), nextInvoiceAt: z.coerce.date() }).partial().optional(),
    }),
    req.body,
  );
  const tenant = await Tenant.findById(param(req, 'id'));
  if (!tenant) throw notFound('Tenant');
  if (body.status === 'suspended' && !body.suspendedReason) throw badRequest('Give a reason for suspension');
  const before = { plan: tenant.plan, status: tenant.status, billing: tenant.toObject().billing };
  if (body.plan) tenant.plan = body.plan;
  if (body.status) tenant.status = body.status;
  if (body.suspendedReason !== undefined) tenant.suspendedReason = body.suspendedReason;
  if (body.billing) for (const [k, v] of Object.entries(body.billing)) tenant.set(`billing.${k}`, v);
  await tenant.save();
  await auditReq(req, { tenantId: tenant._id, action: 'platform.tenant_update', entity: 'Tenant', entityId: tenant._id, before, after: body, reason: body.suspendedReason });
  revalidateFirm(tenant.slug);
  res.json({ ok: true });
});

adminRouter.get('/reports', async (_req, res) => {
  const items = await AbuseReport.find().sort({ createdAt: -1 }).limit(200).lean();
  const tenants = await Tenant.find({ _id: { $in: items.map((i) => i.tenantId).filter(Boolean) } }).select('name slug').lean();
  res.json(items.map((i) => ({ ...i, tenant: tenants.find((t) => String(t._id) === String(i.tenantId)) ?? null })));
});

adminRouter.patch('/reports/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(['open', 'reviewed', 'actioned']) }), req.body);
  const r = await AbuseReport.findByIdAndUpdate(param(req, 'id'), { $set: { status: body.status } }, { returnDocument: 'after' });
  if (!r) throw notFound('Report');
  await auditReq(req, { tenantId: r.tenantId ?? null, action: 'platform.report_update', entity: 'AbuseReport', entityId: r._id, after: body });
  res.json(r);
});

adminRouter.get('/messages', async (req, res) => {
  const status = qstr(req.query.status);
  res.json(await MessageLog.find(status ? { status: status as 'failed' } : {}).sort({ createdAt: -1 }).limit(200).lean());
});
