import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { Types } from 'mongoose';
import { Commission, Estate, Lead, Product, RealtorProfile, ShareEvent, Touch, User } from '../models/index.js';
import { escapeRegex, parse, param, qstr } from '../lib/http.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { encryptField } from '../lib/crypto.js';
import { normalizePhone } from '../lib/phone.js';
import { parseCsv, toCsv } from '../lib/csv.js';
import { formatNaira } from '../lib/format.js';
import { ctx, isRealtor, requireCap } from '../middleware/auth.js';
import { auditReq } from '../services/audit.js';
import { notifyUsers } from '../services/notify.js';
import { revalidateFirm } from '../services/revalidate.js';
import { overrideAttribution } from '../services/attribution.js';
import { createInvite, createRealtor, deliverInvite, realtorSiteUrl, serializeProfile, shortLink } from '../services/realtors.js';
import { effectivePrice } from '../services/commission.js';
import { env } from '../config/env.js';

export const realtorsRouter = Router();

// ---- The signed-in realtor ----------------------------------------------------------------------

async function myProfile(req: Parameters<typeof ctx>[0]) {
  const { tenantId, auth } = ctx(req);
  if (!isRealtor(req)) throw forbidden('Only realtors have a realtor profile');
  const profile = await RealtorProfile.findOne({ tenantId, userId: auth.userId });
  if (!profile) throw notFound('Realtor profile');
  return profile;
}

realtorsRouter.get('/me/profile', async (req, res) => {
  const { tenant } = ctx(req);
  const profile = await myProfile(req);
  res.json({ ...serializeProfile(profile), siteUrl: realtorSiteUrl(tenant.slug, profile.slug), allowEdit: tenant.settings?.site?.allowRealtorEdit });
});

/** RS-03: realtors edit only bio, photo, featured order, testimonials (subject to firm settings). */
realtorsRouter.patch('/me/profile', async (req, res) => {
  const { tenant, auth } = ctx(req);
  const profile = await myProfile(req);
  const allow: { bio?: boolean; photo?: boolean; featuredOrder?: boolean; testimonials?: boolean } = tenant.settings?.site?.allowRealtorEdit ?? {};
  const body = parse(
    z.object({
      bio: z.string().max(1500).optional(),
      photoUrl: z.string().optional(),
      whatsapp: z.string().optional(),
      areasServed: z.array(z.string().max(60)).max(15).optional(),
      featuredEstateIds: z.array(z.string()).max(20).optional(),
      testimonials: z.array(z.object({ name: z.string().max(80), text: z.string().max(500) })).max(10).optional(),
      name: z.string().min(2).optional(),
    }),
    req.body,
  );
  if (body.bio !== undefined && allow.bio === false) throw forbidden('Your firm does not allow editing your bio');
  if (body.photoUrl !== undefined && allow.photo === false) throw forbidden('Your firm does not allow changing your photo');
  if (body.featuredEstateIds !== undefined && allow.featuredOrder === false) throw forbidden('Your firm controls featured estates');
  if (body.testimonials !== undefined && allow.testimonials === false) throw forbidden('Your firm does not allow testimonials');
  if (body.whatsapp !== undefined) {
    const wa = normalizePhone(body.whatsapp);
    if (!wa) throw badRequest('Enter a valid WhatsApp number');
    profile.whatsapp = wa;
  }
  if (body.bio !== undefined) profile.bio = body.bio;
  if (body.photoUrl !== undefined) profile.photoUrl = body.photoUrl;
  if (body.areasServed) profile.areasServed = body.areasServed;
  if (body.testimonials) profile.set('testimonials', body.testimonials);
  if (body.featuredEstateIds) profile.set('featuredEstateIds', body.featuredEstateIds.map((id) => new Types.ObjectId(id)));
  await profile.save();
  if (body.name) await User.updateOne({ _id: auth.userId }, { $set: { name: body.name } });
  revalidateFirm(tenant.slug, [`realtor:${tenant.slug}:${profile.slug}`]);
  res.json(serializeProfile(profile));
});

/** RM-03: bank details for commission, encrypted at rest and masked after save. */
realtorsRouter.put('/me/bank', async (req, res) => {
  const profile = await myProfile(req);
  const body = parse(z.object({ bankName: z.string().min(2), accountName: z.string().min(2), accountNumber: z.string().regex(/^\d{10}$/, 'NUBAN account numbers have 10 digits') }), req.body);
  profile.set('bank', { bankName: body.bankName, accountName: body.accountName, accountNumberEnc: encryptField(body.accountNumber), accountLast4: body.accountNumber.slice(-4) });
  await profile.save();
  await auditReq(req, { action: 'realtor.bank_updated', entity: 'RealtorProfile', entityId: profile._id });
  res.json(serializeProfile(profile));
});

/** SD-01..SD-05: links, captions, QR codes and share buttons per estate. */
realtorsRouter.get('/me/share-kit', async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const profile = await myProfile(req);
  const user = await User.findById(profile.userId).lean();
  const estates = await Estate.find({ tenantId, published: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const products = await Product.find({ tenantId, estateId: { $in: estates.map((e) => e._id) } }).lean();
  const siteUrl = realtorSiteUrl(tenant.slug, profile.slug);
  const template = tenant.settings?.defaultCaption ?? '';
  res.json({
    siteUrl,
    siteShortLink: shortLink(profile.code),
    code: profile.code,
    estates: estates.map((e) => {
      const ps = products.filter((p) => String(p.estateId) === String(e._id));
      const fromPrice = ps.length ? Math.min(...ps.map((p) => effectivePrice(p as never))) : null;
      const link = shortLink(profile.code, e.slug);
      const caption = (e.shareCaption || template)
        .replaceAll('{estate}', e.name)
        .replaceAll('{location}', [e.location?.area, e.location?.state].filter(Boolean).join(', '))
        .replaceAll('{price}', fromPrice ? formatNaira(fromPrice) : 'enquire')
        .replaceAll('{realtor}', user?.name ?? '')
        .replaceAll('{phone}', profile.whatsapp ?? '')
        .replaceAll('{link}', link);
      return {
        id: String(e._id),
        name: e.name,
        slug: e.slug,
        status: e.status,
        image: e.media?.images?.[0]?.variants?.sm ?? e.media?.images?.[0]?.url ?? null,
        fromPrice,
        link,
        links: Object.fromEntries(['whatsapp', 'instagram', 'facebook', 'x', 'qr'].map((c) => [c, shortLink(profile.code, e.slug, c)])),
        pageUrl: `${siteUrl}/estates/${e.slug}`,
        caption,
      };
    }),
  });
});

realtorsRouter.post('/me/share-event', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  const profile = await myProfile(req);
  const body = parse(z.object({ estateId: z.string().optional(), channel: z.string().max(20).optional(), action: z.enum(['share', 'copy_caption', 'copy_link', 'download_qr']).default('share') }), req.body);
  await ShareEvent.create({ tenantId, realtorId: auth.userId, estateId: body.estateId ? new Types.ObjectId(body.estateId) : null, channel: body.channel, action: body.action });
  profile.lastShareAt = new Date();
  await profile.save();
  res.json({ ok: true });
});

// ---- QR codes (SD-05) ---------------------------------------------------------------------------

realtorsRouter.get('/qr', async (req, res) => {
  const text = qstr(req.query.text);
  if (!text) throw badRequest('text is required');
  const allowed = [env.CLIENT_URL, env.SHORT_LINK_BASE, env.ROOT_DOMAIN ? `.${env.ROOT_DOMAIN}` : null].filter(Boolean) as string[];
  if (!allowed.some((a) => text.startsWith(a) || (a.startsWith('.') && new URL(text).hostname.endsWith(a)))) throw badRequest('QR codes can only point to RealtorStack links');
  const format = req.query.format === 'png' ? 'png' : 'svg';
  if (format === 'png') {
    const buf = await QRCode.toBuffer(text, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    res.type('png');
    if (req.query.download) res.attachment('qr-code.png');
    res.send(buf);
  } else {
    res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
  }
});

// ---- Admin: realtor network (RM-01..RM-05) ------------------------------------------------------

realtorsRouter.get('/', requireCap('realtors.read'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const userFilter: Record<string, unknown> = { tenantId, role: 'realtor' };
  const status = qstr(req.query.status);
  if (status) userFilter.status = status;
  const q = qstr(req.query.q);
  if (q) userFilter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { phone: new RegExp(escapeRegex(q)) }, { email: new RegExp(escapeRegex(q), 'i') }];
  const users = await User.find(userFilter).sort({ createdAt: -1 }).lean();
  const ids = users.map((u) => u._id);
  const [profiles, leadCounts, clickCounts, commissionSums] = await Promise.all([
    RealtorProfile.find({ tenantId, userId: { $in: ids } }).lean(),
    Lead.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, status: { $ne: 'merged' } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
    Touch.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, type: { $in: ['visit', 'shortlink'] } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
    Commission.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, status: { $ne: 'void' } } }, { $group: { _id: '$realtorId', total: { $sum: '$amount' } } }]),
  ]);
  const by = <T extends { _id: unknown }>(rows: T[]) => new Map(rows.map((r) => [String(r._id), r]));
  const leadsBy = by(leadCounts), clicksBy = by(clickCounts), commBy = by(commissionSums);
  const rows = users.map((u) => {
    const p = profiles.find((x) => String(x.userId) === String(u._id));
    return {
      id: String(u._id),
      name: u.name,
      phone: u.phone,
      email: u.email,
      status: u.status,
      code: p?.code,
      slug: p?.slug,
      photoUrl: p?.photoUrl,
      siteUrl: p ? realtorSiteUrl(tenant.slug, p.slug) : null,
      source: p?.source,
      activatedAt: p?.activatedAt,
      lastShareAt: p?.lastShareAt,
      lastLeadAt: p?.lastLeadAt,
      leads: (leadsBy.get(String(u._id)) as { n?: number } | undefined)?.n ?? 0,
      clicks: (clicksBy.get(String(u._id)) as { n?: number } | undefined)?.n ?? 0,
      commission: (commBy.get(String(u._id)) as { total?: number } | undefined)?.total ?? 0,
      createdAt: u.createdAt,
    };
  });
  if (req.query.format === 'csv') {
    res.type('text/csv').attachment('realtors.csv').send(toCsv(rows as never, [
      { key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' }, { key: 'clicks', label: 'Link clicks' }, { key: 'leads', label: 'Leads' }, { key: 'commission', label: 'Commission (NGN)' },
      { key: 'lastShareAt', label: 'Last share' }, { key: 'siteUrl', label: 'Site' },
    ]));
    return;
  }
  res.json(rows);
});

realtorsRouter.post('/invite', requireCap('realtors.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const body = parse(z.object({ name: z.string().min(2), phone: z.string().optional(), email: z.string().email().optional().or(z.literal('')) }), req.body);
  const { user, profile } = await createRealtor({ tenant, name: body.name, phone: body.phone, email: body.email || undefined, status: 'invited', source: 'invite' });
  const invite = await createInvite(tenantId, user._id, auth.userId);
  await deliverInvite(tenant, user, invite.url);
  await auditReq(req, { action: 'realtor.invite', entity: 'User', entityId: user._id, after: { name: user.name, phone: user.phone, email: user.email } });
  res.status(201).json({ id: String(user._id), code: profile.code, inviteUrl: invite.url });
});

/** RM-01 bulk: CSV with columns name, phone, email. */
realtorsRouter.post('/import', requireCap('realtors.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const { csv } = parse(z.object({ csv: z.string().min(5).max(500_000) }), req.body);
  const rows = parseCsv(csv);
  if (!rows.length) throw badRequest('The CSV has no rows. Expected columns: name, phone, email');
  if (rows.length > 1000) throw badRequest('Import at most 1,000 realtors at a time');
  const results: { row: number; name: string; ok: boolean; error?: string; code?: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const name = r.name || r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ');
    try {
      const { user, profile } = await createRealtor({ tenant, name, phone: r.phone || r.phone_number || undefined, email: r.email || undefined, status: 'invited', source: 'csv' });
      const invite = await createInvite(tenantId, user._id, auth.userId);
      await deliverInvite(tenant, user, invite.url);
      results.push({ row: i + 2, name, ok: true, code: profile.code });
    } catch (err) {
      const msg = (err as { code?: number }).code === 11000 ? 'Already exists (duplicate phone or email)' : (err as Error).message;
      results.push({ row: i + 2, name, ok: false, error: msg });
    }
  }
  await auditReq(req, { action: 'realtor.import', entity: 'Tenant', entityId: tenantId, after: { total: rows.length, ok: results.filter((r) => r.ok).length } });
  res.json({ imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
});

realtorsRouter.get('/:id', requireCap('realtors.read'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const user = await User.findOne({ tenantId, _id: param(req, 'id'), role: 'realtor' }).lean();
  if (!user) throw notFound('Realtor');
  const profile = await RealtorProfile.findOne({ tenantId, userId: user._id }).lean();
  const [leads, openLeads] = await Promise.all([
    Lead.countDocuments({ tenantId, realtorId: user._id, status: { $ne: 'merged' } }),
    Lead.countDocuments({ tenantId, realtorId: user._id, status: { $nin: ['completed', 'lost', 'merged'] } }),
  ]);
  res.json({
    id: String(user._id), name: user.name, phone: user.phone, email: user.email, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt,
    profile: profile ? { ...serializeProfile(profile), siteUrl: realtorSiteUrl(tenant.slug, profile.slug) } : null,
    leads, openLeads,
  });
});

realtorsRouter.post('/:id/resend-invite', requireCap('realtors.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const user = await User.findOne({ tenantId, _id: param(req, 'id'), role: 'realtor', status: 'invited' });
  if (!user) throw notFound('Invited realtor');
  const invite = await createInvite(tenantId, user._id, auth.userId);
  await deliverInvite(tenant, user, invite.url);
  res.json({ inviteUrl: invite.url });
});

/**
 * RM-05: pending → active (approve), active ↔ suspended, any → exited.
 * Suspended realtors' sites show a firm fallback page; historical attribution is preserved.
 * On exit/suspension, open leads can be reassigned (§9.4) — earned commissions stay theirs.
 */
realtorsRouter.patch('/:id/status', requireCap('realtors.manage'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const body = parse(z.object({ status: z.enum(['active', 'suspended', 'exited']), reason: z.string().max(500).optional(), reassignTo: z.string().nullable().optional() }), req.body);
  const user = await User.findOne({ tenantId, _id: param(req, 'id'), role: 'realtor' });
  if (!user) throw notFound('Realtor');
  if (user.status === 'exited' && body.status !== 'exited') throw badRequest('Exited realtors cannot be reactivated; invite them again instead');
  if (user.status === 'invited' && body.status === 'active') throw badRequest('This realtor has not accepted their invite yet');
  if ((body.status === 'suspended' || body.status === 'exited') && !body.reason) throw badRequest('Please give a reason');
  const before = user.status;
  user.status = body.status;
  if (body.status !== 'active') user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  const profile = await RealtorProfile.findOne({ tenantId, userId: user._id });
  if (body.status === 'active' && profile && !profile.activatedAt) {
    profile.activatedAt = new Date();
    await profile.save();
  }

  let reassigned = 0;
  if (body.reassignTo !== undefined && body.status !== 'active') {
    const open = await Lead.find({ tenantId, realtorId: user._id, status: { $nin: ['completed', 'lost', 'merged'] } }).select('_id');
    for (const l of open) {
      await overrideAttribution({ tenant, leadId: String(l._id), realtorId: body.reassignTo, reason: `Realtor ${body.status}: ${body.reason}`, actorId: auth.userId, actorRole: auth.role, rule: 'reassigned' });
      reassigned++;
    }
  }
  await auditReq(req, { action: `realtor.${body.status}`, entity: 'User', entityId: user._id, before: { status: before }, after: { status: body.status, reassigned }, reason: body.reason });
  if (before === 'pending' && body.status === 'active') {
    await notifyUsers({ tenant, userIds: [user._id], type: 'realtor.approved', title: 'Your realtor site is live', body: `${tenant.name} approved your account. Start sharing your property links.`, link: '/app' });
  }
  if (profile) revalidateFirm(tenant.slug, [`realtor:${tenant.slug}:${profile.slug}`]);
  res.json({ ok: true, reassigned });
});
