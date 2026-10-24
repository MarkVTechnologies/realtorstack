import { Router } from 'express';
import { z } from 'zod';
import { Estate, RealtorProfile, ShareEvent, Touch, User, STAFF_ROLES } from '../models/index.js';
import { parse, param } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { normalizePhone } from '../lib/phone.js';
import { ctx, requireCap } from '../middleware/auth.js';
import { auditReq } from '../services/audit.js';
import { revalidateFirm } from '../services/revalidate.js';
import { createInvite, deliverInvite, firmSiteUrl } from '../services/realtors.js';
import { env } from '../config/env.js';

export const firmRouter = Router();

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a hex colour like #0f5132');

function serializeFirm(t: ReturnType<typeof ctx>['tenant']) {
  const o = t.toObject();
  return {
    ...o,
    siteUrl: firmSiteUrl(t.slug),
    registrationUrl: o.registration?.code ? `${env.CLIENT_URL}/register/${t.slug}?code=${o.registration.code}` : null,
  };
}

firmRouter.get('/', (req, res) => {
  res.json(serializeFirm(ctx(req).tenant));
});

const firmPatch = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().optional(),
  cacNumber: z.string().optional(),
  brand: z.object({ primaryColor: hex, accentColor: hex, theme: z.enum(['classic', 'modern', 'bold']) }).partial().optional(),
  contact: z.object({ phone: z.string(), email: z.string(), whatsapp: z.string(), address: z.string(), website: z.string() }).partial().optional(),
  privacyPolicy: z.string().max(20000).optional(),
  registration: z.object({ enabled: z.boolean(), requireApproval: z.boolean() }).partial().optional(),
  onboarding: z.object({ dismissed: z.boolean() }).partial().optional(),
  settings: z
    .object({
      attribution: z
        .object({
          model: z.enum(['first_touch', 'last_touch', 'first_touch_review']),
          windowDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]),
          identityKey: z.enum(['phone', 'phone_email']),
          manualLeads: z.enum(['admin_only', 'realtor_request']),
          windowReset: z.enum(['never', 'on_booking']),
          houseRoundRobin: z.boolean(),
        })
        .partial(),
      commission: z.object({ type: z.enum(['percent', 'fixed']), value: z.number().min(0), earnOn: z.enum(['full_payment', 'deposit']) }).partial(),
      site: z
        .object({
          heroTitle: z.string().max(120),
          heroSubtitle: z.string().max(240),
          whyBuy: z.array(z.object({ title: z.string(), text: z.string() })).max(8),
          faqs: z.array(z.object({ q: z.string(), a: z.string() })).max(20),
          mandatorySections: z.array(z.string()),
          allowRealtorEdit: z.object({ bio: z.boolean(), photo: z.boolean(), featuredOrder: z.boolean(), testimonials: z.boolean() }).partial(),
        })
        .partial(),
      hidePaymentAmountsFromRealtors: z.boolean(),
      defaultCaption: z.string().max(600),
    })
    .partial()
    .optional(),
});

/** Deep-assign a partial object onto a mongoose subdocument path-by-path. */
function assignDeep(doc: { set: (path: string, v: unknown) => void }, prefix: string, value: Record<string, unknown>) {
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) assignDeep(doc, path, v as Record<string, unknown>);
    else doc.set(path, v);
  }
}

firmRouter.patch('/', requireCap('settings'), async (req, res) => {
  const { tenant } = ctx(req);
  const body = parse(firmPatch, req.body);
  if (body.contact?.whatsapp) body.contact.whatsapp = normalizePhone(body.contact.whatsapp) ?? body.contact.whatsapp;
  if (body.contact?.phone) body.contact.phone = normalizePhone(body.contact.phone) ?? body.contact.phone;
  const before = { settings: tenant.toObject().settings, brand: tenant.toObject().brand };
  assignDeep(tenant, '', body as Record<string, unknown>);
  await tenant.save();
  if (body.settings?.attribution || body.settings?.commission) {
    await auditReq(req, { action: 'firm.settings', entity: 'Tenant', entityId: tenant._id, before: before.settings, after: tenant.toObject().settings });
  } else {
    await auditReq(req, { action: 'firm.update', entity: 'Tenant', entityId: tenant._id, after: body });
  }
  revalidateFirm(tenant.slug);
  res.json(serializeFirm(tenant));
});

firmRouter.post('/registration/rotate', requireCap('realtors.manage'), async (req, res) => {
  const { tenant } = ctx(req);
  tenant.set('registration.code', randomToken(9));
  tenant.set('registration.enabled', true);
  await tenant.save();
  await auditReq(req, { action: 'firm.registration_rotated', entity: 'Tenant', entityId: tenant._id });
  res.json(serializeFirm(tenant));
});

/** FW-04: brand setup → first estate → invite realtors → share first link. */
firmRouter.get('/onboarding', async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const [estates, realtors, shares, touches] = await Promise.all([
    Estate.countDocuments({ tenantId }),
    User.countDocuments({ tenantId, role: 'realtor' }),
    ShareEvent.countDocuments({ tenantId }),
    Touch.countDocuments({ tenantId, realtorId: { $ne: null } }),
  ]);
  const steps = [
    { key: 'brand', label: 'Set up your brand', done: !!tenant.logoUrl && !!tenant.contact?.phone, href: '/app/settings' },
    { key: 'estate', label: 'Add your first estate', done: estates > 0, href: '/app/estates/new' },
    { key: 'realtors', label: 'Invite realtors', done: realtors > 0, href: '/app/realtors' },
    { key: 'share', label: 'Share your first link', done: shares > 0 || touches > 0, href: '/app/share' },
  ];
  res.json({ steps, complete: steps.every((s) => s.done), dismissed: !!tenant.onboarding?.dismissed });
});

// ---- Staff team (FW-03) -----------------------------------------------------------------------

firmRouter.get('/team', requireCap('team.manage'), async (req, res) => {
  const { tenantId } = ctx(req);
  const users = await User.find({ tenantId, role: { $in: STAFF_ROLES } }).sort({ createdAt: 1 }).lean();
  res.json(users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt })));
});

firmRouter.post('/team', requireCap('team.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const body = parse(z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['admin', 'sales_manager', 'finance', 'owner']) }), req.body);
  if (body.role === 'owner' && auth.role !== 'owner') throw badRequest('Only an owner can add another owner');
  const user = await User.create({ tenantId, name: body.name, email: body.email.toLowerCase(), role: body.role, status: 'invited' });
  const invite = await createInvite(tenantId, user._id, auth.userId);
  await deliverInvite(tenant, user, invite.url);
  await auditReq(req, { action: 'team.invite', entity: 'User', entityId: user._id, after: { role: body.role, email: body.email } });
  res.status(201).json({ id: String(user._id), inviteUrl: invite.url });
});

firmRouter.patch('/team/:id', requireCap('team.manage'), async (req, res) => {
  const { tenantId, auth } = ctx(req);
  const body = parse(z.object({ role: z.enum(['owner', 'admin', 'sales_manager', 'finance']).optional(), status: z.enum(['active', 'suspended']).optional() }), req.body);
  const user = await User.findOne({ tenantId, _id: param(req, 'id'), role: { $in: STAFF_ROLES } });
  if (!user) throw notFound('Team member');
  if (String(user._id) === String(auth.userId)) throw badRequest('You cannot change your own role or status');
  if ((user.role === 'owner' || body.role === 'owner') && auth.role !== 'owner') throw badRequest('Only an owner can change owners');
  const before = { role: user.role, status: user.status };
  if (body.role) user.role = body.role;
  if (body.status) {
    user.status = body.status;
    if (body.status === 'suspended') user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  }
  await user.save();
  await auditReq(req, { action: 'team.update', entity: 'User', entityId: user._id, before, after: body });
  res.json({ ok: true });
});

firmRouter.post('/team/:id/resend', requireCap('team.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const user = await User.findOne({ tenantId, _id: param(req, 'id'), status: 'invited' });
  if (!user) throw notFound('Pending invite');
  const invite = await createInvite(tenantId, user._id, auth.userId);
  await deliverInvite(tenant, user, invite.url);
  res.json({ inviteUrl: invite.url });
});

/** Realtor groups are Phase 3 (RM-06); expose the realtor count per status for settings screens. */
firmRouter.get('/seats', async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const active = await User.countDocuments({ tenantId, role: 'realtor', status: 'active' });
  const profiles = await RealtorProfile.countDocuments({ tenantId });
  res.json({ active, total: profiles, limit: tenant.billing?.seatLimit ?? null, plan: tenant.plan });
});
