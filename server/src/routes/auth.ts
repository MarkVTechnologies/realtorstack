import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { Invite, Otp, RealtorProfile, Tenant, User } from '../models/index.js';
import { parse } from '../lib/http.js';
import { normalizePhone } from '../lib/phone.js';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { sha256 } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { CAPABILITIES, clearSession, issueSession, requireAuth, type Capability } from '../middleware/auth.js';
import { sendSms } from '../services/mailer.js';
import { createRealtor, realtorSiteUrl, serializeProfile } from '../services/realtors.js';
import { audit } from '../services/audit.js';
import { notifyRoles } from '../services/notify.js';

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 10 * 60_000, limit: env.isProd ? 20 : 500, standardHeaders: 'draft-8', legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: env.isProd ? 6 : 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many codes requested. Please wait a few minutes.' } });

const OTP_TTL_MS = 10 * 60_000;

async function issueOtp(phone: string, purpose: 'login' | 'invite' | 'register') {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await Otp.updateMany({ phone, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } });
  await Otp.create({ phone, purpose, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await sendSms(phone, `Your RealtorStack verification code is ${code}. It expires in 10 minutes.`);
  return env.EXPOSE_DEV_OTP ? { devCode: code } : {};
}

async function verifyOtp(phone: string, purpose: 'login' | 'invite' | 'register', code: string) {
  const otp = await Otp.findOne({ phone, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp) throw badRequest('Code expired. Request a new one.');
  if (otp.attempts >= 5) throw badRequest('Too many attempts. Request a new code.');
  if (otp.codeHash !== sha256(`${phone}:${code.trim()}`)) {
    otp.attempts += 1;
    await otp.save();
    throw badRequest('Incorrect code');
  }
  otp.consumedAt = new Date();
  await otp.save();
}

function capabilitiesFor(role: string) {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => (CAPABILITIES[c] as readonly string[]).includes(role));
}

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const users = await User.find({ email: body.email.toLowerCase(), status: { $in: ['active', 'pending'] } }).select('+passwordHash');
  for (const user of users) {
    if (user.passwordHash && (await bcrypt.compare(body.password, user.passwordHash))) {
      user.lastLoginAt = new Date();
      await user.save();
      issueSession(res, user);
      res.json({ ok: true });
      return;
    }
  }
  throw unauthorized('Incorrect email or password');
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/** OTP login for realtors (NFR Security: "OTP login option for realtors"). */
authRouter.post('/otp/request', otpLimiter, async (req, res) => {
  const { phone: raw } = parse(z.object({ phone: z.string() }), req.body);
  const phone = normalizePhone(raw);
  if (!phone) throw badRequest('Enter a valid Nigerian phone number');
  const exists = await User.exists({ phone, status: { $in: ['active', 'pending'] } });
  // Do not reveal whether the number has an account.
  const extra = exists ? await issueOtp(phone, 'login') : {};
  res.json({ ok: true, phone, ...extra });
});

authRouter.post('/otp/verify', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ phone: z.string(), code: z.string().optional(), selectionToken: z.string().optional(), accountId: z.string().optional() }),
    req.body,
  );
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest('Enter a valid phone number');
  const users = await User.find({ phone, status: { $in: ['active', 'pending'] } }).lean();
  if (!users.length) throw badRequest('Incorrect code');

  if (body.selectionToken) {
    // Second step of a multi-firm login: the phone was already verified.
    try {
      const sel = jwt.verify(body.selectionToken, env.JWT_SECRET) as { phone: string; purpose: string };
      if (sel.purpose !== 'select' || sel.phone !== phone) throw new Error();
    } catch {
      throw unauthorized('Selection expired, please sign in again');
    }
  } else {
    if (!body.code) throw badRequest('Enter the code we sent you');
    await verifyOtp(phone, 'login', body.code);
    if (users.length > 1 && !body.accountId) {
      // A realtor may sell for more than one firm — let them pick which workspace to open.
      const tenants = await Tenant.find({ _id: { $in: users.map((u) => u.tenantId) } }).select('name').lean();
      res.json({
        chooseAccount: true,
        selectionToken: jwt.sign({ phone, purpose: 'select' }, env.JWT_SECRET, { expiresIn: '5m' }),
        accounts: users.map((u) => ({ id: String(u._id), role: u.role, firm: tenants.find((t) => String(t._id) === String(u.tenantId))?.name ?? 'Platform' })),
      });
      return;
    }
  }
  const user = body.accountId ? users.find((u) => String(u._id) === body.accountId) : users[0];
  if (!user) throw badRequest('Unknown account');
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), phoneVerifiedAt: new Date() } });
  issueSession(res, user);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth!.userId).lean();
  if (!user) throw unauthorized();
  const tenant = req.tenant;
  const profile = user.role === 'realtor' && tenant ? await RealtorProfile.findOne({ tenantId: tenant._id, userId: user._id }).lean() : null;
  res.json({
    user: { id: String(user._id), name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status, hasPassword: !!(await User.findById(user._id).select('+passwordHash').lean())?.passwordHash, notificationPrefs: user.notificationPrefs },
    tenant: tenant
      ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl, brand: tenant.brand, status: tenant.status, plan: tenant.plan, manualLeads: tenant.settings?.attribution?.manualLeads ?? 'admin_only' }
      : null,
    realtor: profile ? { ...serializeProfile(profile), siteUrl: realtorSiteUrl(tenant!.slug, profile.slug) } : null,
    capabilities: capabilitiesFor(user.role),
  });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(z.object({ name: z.string().min(2).optional(), notificationPrefs: z.object({ email: z.boolean(), inApp: z.boolean() }).optional() }), req.body);
  await User.updateOne({ _id: req.auth!.userId }, { $set: body });
  res.json({ ok: true });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8, 'Use at least 8 characters') }), req.body);
  const user = await User.findById(req.auth!.userId).select('+passwordHash');
  if (!user) throw unauthorized();
  if (user.passwordHash && !(body.currentPassword && (await bcrypt.compare(body.currentPassword, user.passwordHash)))) {
    throw badRequest('Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out other sessions
  await user.save();
  issueSession(res, user);
  res.json({ ok: true });
});

// ---- Invites (RM-01, flow 12.2) ----------------------------------------------------------------

async function loadInvite(token: string) {
  const invite = await Invite.findOne({ tokenHash: sha256(token) });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) throw notFound('Invite (it may have expired)');
  const user = await User.findById(invite.userId);
  const tenant = await Tenant.findById(invite.tenantId);
  if (!user || !tenant) throw notFound('Invite');
  if (tenant.status === 'suspended') throw forbidden('This workspace is suspended');
  return { invite, user, tenant };
}

authRouter.get('/invite/:token', async (req, res) => {
  const { user, tenant } = await loadInvite(String(req.params.token));
  res.json({
    firm: { name: tenant.name, logoUrl: tenant.logoUrl, brand: tenant.brand },
    user: { name: user.name, phone: user.phone, email: user.email, role: user.role },
  });
});

authRouter.post('/invite/:token/otp', otpLimiter, async (req, res) => {
  const { user } = await loadInvite(String(req.params.token));
  const { phone: raw } = parse(z.object({ phone: z.string().optional() }), req.body);
  const phone = normalizePhone(raw ?? user.phone);
  if (!phone) throw badRequest('Enter a valid Nigerian phone number');
  const taken = await User.exists({ tenantId: user.tenantId, phone, _id: { $ne: user._id } });
  if (taken) throw badRequest('This phone number is already used by another account in this firm');
  res.json({ ok: true, phone, ...(await issueOtp(phone, 'invite')) });
});

authRouter.post('/invite/:token/accept', authLimiter, async (req, res) => {
  const { invite, user, tenant } = await loadInvite(String(req.params.token));
  const body = parse(
    z.object({
      phone: z.string().optional(),
      code: z.string().optional(),
      name: z.string().min(2).optional(),
      whatsapp: z.string().optional(),
      password: z.string().min(8, 'Use at least 8 characters').optional(),
    }),
    req.body,
  );
  if (user.role === 'realtor') {
    const phone = normalizePhone(body.phone ?? user.phone);
    if (!phone || !body.code) throw badRequest('Verify your phone number to continue');
    await verifyOtp(phone, 'invite', body.code);
    user.phone = phone;
    user.phoneVerifiedAt = new Date();
    const whatsapp = normalizePhone(body.whatsapp) ?? phone;
    await RealtorProfile.updateOne({ tenantId: tenant._id, userId: user._id }, { $set: { whatsapp, activatedAt: new Date() } });
  } else if (!body.password) {
    throw badRequest('Choose a password to continue');
  }
  if (body.password) user.passwordHash = await bcrypt.hash(body.password, 12);
  if (body.name) user.name = body.name;
  user.status = 'active';
  user.lastLoginAt = new Date();
  await user.save();
  invite.usedAt = new Date();
  await invite.save();
  await audit({ tenantId: tenant._id, actorId: user._id, actorRole: user.role, action: 'user.activated', entity: 'User', entityId: user._id });
  issueSession(res, user);
  res.json({ ok: true, role: user.role });
});

// ---- Self-registration via firm link / QR (RM-02) ----------------------------------------------

async function loadRegistration(firmSlug: string, code: string | undefined) {
  const tenant = await Tenant.findOne({ slug: firmSlug.toLowerCase() });
  if (!tenant || tenant.status !== 'active') throw notFound('Firm');
  if (!tenant.registration?.enabled || !code || tenant.registration.code !== code) throw forbidden('This registration link is not valid. Ask your firm for a new one.');
  return tenant;
}

authRouter.get('/register/:firm', async (req, res) => {
  const tenant = await loadRegistration(String(req.params.firm), String(req.query.code ?? ''));
  res.json({ firm: { name: tenant.name, logoUrl: tenant.logoUrl, brand: tenant.brand, requireApproval: tenant.registration?.requireApproval ?? true } });
});

authRouter.post('/register/:firm/otp', otpLimiter, async (req, res) => {
  const body = parse(z.object({ code: z.string(), phone: z.string() }), req.body);
  const tenant = await loadRegistration(String(req.params.firm), body.code);
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest('Enter a valid Nigerian phone number');
  if (await User.exists({ tenantId: tenant._id, phone })) throw badRequest('This phone number is already registered with this firm. Sign in instead.');
  res.json({ ok: true, phone, ...(await issueOtp(phone, 'register')) });
});

authRouter.post('/register/:firm', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ code: z.string(), phone: z.string(), otp: z.string(), name: z.string().min(2), email: z.string().email().optional().or(z.literal('')), whatsapp: z.string().optional() }),
    req.body,
  );
  const tenant = await loadRegistration(String(req.params.firm), body.code);
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest('Enter a valid Nigerian phone number');
  await verifyOtp(phone, 'register', body.otp);
  const requireApproval = tenant.registration?.requireApproval ?? true;
  const { user } = await createRealtor({
    tenant, name: body.name, phone, email: body.email || undefined, whatsapp: body.whatsapp,
    status: requireApproval ? 'pending' : 'active', source: 'registration_link',
  });
  user.phoneVerifiedAt = new Date();
  await user.save();
  await audit({ tenantId: tenant._id, actorId: user._id, actorRole: 'realtor', action: 'realtor.self_registered', entity: 'User', entityId: user._id });
  await notifyRoles(tenant, ['owner', 'admin', 'sales_manager'], {
    type: 'realtor.registered', title: requireApproval ? 'New realtor awaiting approval' : 'New realtor joined',
    body: `${user.name} (${phone}) registered via your recruitment link.`, link: '/app/realtors?status=pending', email: requireApproval,
  });
  issueSession(res, user);
  res.json({ ok: true, status: user.status });
});
