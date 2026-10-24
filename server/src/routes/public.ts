import { Router, type Request } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AbuseReport, Booking, Estate, Product, RealtorProfile, Tenant, Touch, User, CHANNELS, type TenantDoc } from '../models/index.js';
import { parse, param } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { hashIp } from '../lib/crypto.js';
import { formatLagos } from '../lib/format.js';
import { env } from '../config/env.js';
import { ingestLeadEvent } from '../services/attribution.js';
import { effectivePrice, planTotal } from '../services/commission.js';
import { availableSlots } from '../services/slots.js';
import { sendEmail, sendSms } from '../services/mailer.js';
import { codeFromShort } from '../services/realtors.js';

export const publicRouter = Router();

const writeLimiter = rateLimit({ windowMs: 60_000, limit: env.isProd ? 20 : 1000, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests, please try again shortly.' } });
const touchLimiter = rateLimit({ windowMs: 60_000, limit: env.isProd ? 120 : 5000, standardHeaders: 'draft-8', legacyHeaders: false });

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|twitterbot|linkedin|telegram|discord|preview|headless|lighthouse|pingdom|curl|wget/i;
const isBot = (req: Request) => BOT_UA.test(req.get('user-agent') ?? '');
const vidSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional();
const channelSchema = z.enum(CHANNELS).catch('other').optional();

async function loadFirm(slug: string) {
  const tenant = await Tenant.findOne({ slug: slug.toLowerCase() });
  if (!tenant) throw notFound('Firm');
  return tenant;
}

async function activeFirm(slug: string) {
  const tenant = await loadFirm(slug);
  if (tenant.status !== 'active') throw badRequest('This site is currently unavailable');
  return tenant;
}

/** Resolve a realtor slug to an active realtor's user id. "main" (house) or inactive → null. */
async function resolveRealtor(tenant: TenantDoc, realtorSlug?: string) {
  if (!realtorSlug || realtorSlug === 'main') return null;
  const profile = await RealtorProfile.findOne({ tenantId: tenant._id, slug: realtorSlug.toLowerCase() }).select('userId').lean();
  if (!profile) return null;
  const user = await User.findOne({ _id: profile.userId, tenantId: tenant._id, status: 'active' }).select('_id').lean();
  return user?._id ?? null;
}

function publicCache(res: import('express').Response, seconds = 60) {
  res.set('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds * 5}, stale-while-revalidate=86400`);
}

function shapeProduct(p: InstanceType<typeof Product> | Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const price = effectivePrice(p as never);
  const promoActive = price !== p.outrightPrice;
  return {
    id: String(p._id), name: p.name, type: p.type, size: p.size, status: p.status,
    outrightPrice: p.outrightPrice, price, promo: promoActive ? { label: p.promo?.label, endsAt: p.promo?.endsAt, price: p.promo?.price } : null,
    plans: (p.plans ?? []).map((pl: { name: string; depositAmount: number; tenorMonths: number; monthlyAmount: number; totalPrice?: number }) => ({
      name: pl.name, depositAmount: pl.depositAmount, tenorMonths: pl.tenorMonths, monthlyAmount: pl.monthlyAmount, totalPrice: planTotal(pl),
    })),
  };
}

function shapeFirm(t: TenantDoc) {
  return {
    name: t.name, slug: t.slug, logoUrl: t.logoUrl, brand: t.brand, contact: t.contact, cacNumber: t.cacNumber, status: t.status,
    site: {
      heroTitle: t.settings?.site?.heroTitle, heroSubtitle: t.settings?.site?.heroSubtitle,
      whyBuy: t.settings?.site?.whyBuy ?? [], faqs: t.settings?.site?.faqs ?? [], mandatorySections: t.settings?.site?.mandatorySections ?? [],
    },
    hasPrivacyPolicy: !!t.privacyPolicy,
  };
}

// ---- Site data (consumed by cached Next.js pages) ------------------------------------------------

publicRouter.get('/sites/:firm', async (req, res) => {
  const tenant = await loadFirm(param(req, 'firm'));
  publicCache(res);
  if (tenant.status !== 'active') {
    res.json({ firm: shapeFirm(tenant), estates: [] });
    return;
  }
  const estates = await Estate.find({ tenantId: tenant._id, published: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const products = await Product.find({ tenantId: tenant._id, estateId: { $in: estates.map((e) => e._id) } }).sort({ sortOrder: 1, outrightPrice: 1 }).lean();
  res.json({
    firm: shapeFirm(tenant),
    estates: estates.map((e) => {
      const ps = products.filter((p) => String(p.estateId) === String(e._id)).map(shapeProduct);
      const deposits = ps.flatMap((p) => p.plans.map((pl: { depositAmount: number }) => pl.depositAmount));
      return {
        id: String(e._id), name: e.name, slug: e.slug, tagline: e.tagline, status: e.status, location: e.location,
        documents: e.documents, amenities: e.amenities.slice(0, 6), cover: e.media?.images?.[0] ?? null, updatedAt: e.updatedAt,
        fromPrice: ps.length ? Math.min(...ps.map((p) => p.price)) : null,
        minDeposit: deposits.length ? Math.min(...deposits) : null,
        hasPromo: ps.some((p) => p.promo),
        productCount: ps.length,
      };
    }),
  });
});

publicRouter.get('/sites/:firm/privacy', async (req, res) => {
  const tenant = await loadFirm(param(req, 'firm'));
  publicCache(res, 300);
  res.json({ firm: shapeFirm(tenant), privacyPolicy: tenant.privacyPolicy ?? null });
});

publicRouter.get('/sites/:firm/realtors/:realtor', async (req, res) => {
  const tenant = await loadFirm(param(req, 'firm'));
  const slug = param(req, 'realtor').toLowerCase();
  publicCache(res);
  if (slug === 'main') {
    res.json({ active: true, house: true, realtor: { name: tenant.name, slug: 'main', phone: tenant.contact?.phone, whatsapp: tenant.contact?.whatsapp || tenant.contact?.phone, photoUrl: tenant.logoUrl, bio: null, testimonials: [], featuredEstateIds: [], areasServed: [] } });
    return;
  }
  const profile = await RealtorProfile.findOne({ tenantId: tenant._id, slug }).lean();
  if (!profile) throw notFound('Realtor');
  const user = await User.findOne({ _id: profile.userId, tenantId: tenant._id }).select('name phone status').lean();
  if (!user) throw notFound('Realtor');
  const active = user.status === 'active' && tenant.status === 'active';
  res.json({
    active,
    house: false,
    // RM-05: suspended/exited realtors' sites show the firm fallback page — no personal contact details.
    realtor: active
      ? { name: user.name, slug: profile.slug, code: profile.code, phone: user.phone, whatsapp: profile.whatsapp ?? user.phone, photoUrl: profile.photoUrl, bio: profile.bio, areasServed: profile.areasServed, testimonials: profile.testimonials, featuredEstateIds: profile.featuredEstateIds.map(String) }
      : { name: user.name, slug: profile.slug },
  });
});

publicRouter.get('/sites/:firm/estates/:estate', async (req, res) => {
  const tenant = await activeFirm(param(req, 'firm'));
  const estate = await Estate.findOne({ tenantId: tenant._id, slug: param(req, 'estate').toLowerCase(), published: true }).lean();
  if (!estate) throw notFound('Estate');
  const products = await Product.find({ tenantId: tenant._id, estateId: estate._id }).sort({ sortOrder: 1, outrightPrice: 1 }).lean();
  publicCache(res);
  res.json({
    firm: shapeFirm(tenant),
    estate: {
      id: String(estate._id), name: estate.name, slug: estate.slug, tagline: estate.tagline, description: estate.description, status: estate.status,
      location: estate.location, documents: estate.documents, amenities: estate.amenities, media: estate.media, updatedAt: estate.updatedAt,
      inspection: { days: estate.inspection?.days ?? [], times: estate.inspection?.times ?? [], meetingPoint: estate.inspection?.meetingPoint, transportNotes: estate.inspection?.transportNotes },
      products: products.map(shapeProduct),
    },
  });
});

publicRouter.get('/sites/:firm/estates/:estate/slots', async (req, res) => {
  const tenant = await activeFirm(param(req, 'firm'));
  const estate = await Estate.findOne({ tenantId: tenant._id, slug: param(req, 'estate').toLowerCase(), published: true }).lean();
  if (!estate) throw notFound('Estate');
  res.set('Cache-Control', 'no-store');
  res.json(await availableSlots(tenant._id, estate as never));
});

/** For sitemap.xml generation (RS-07). */
publicRouter.get('/sites/:firm/sitemap', async (req, res) => {
  const tenant = await activeFirm(param(req, 'firm'));
  const [estates, users] = await Promise.all([
    Estate.find({ tenantId: tenant._id, published: true }).select('slug updatedAt').lean(),
    User.find({ tenantId: tenant._id, role: 'realtor', status: 'active' }).select('_id').lean(),
  ]);
  const profiles = await RealtorProfile.find({ tenantId: tenant._id, userId: { $in: users.map((u) => u._id) } }).select('slug updatedAt').lean();
  publicCache(res, 600);
  res.json({ estates: estates.map((e) => ({ slug: e.slug, updatedAt: e.updatedAt })), realtors: profiles.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })) });
});

// ---- Tracking (§9.2) -------------------------------------------------------------------------

const touchInput = z.object({
  firm: z.string(),
  realtor: z.string().optional(),
  estate: z.string().optional(),
  vid: vidSchema,
  channel: channelSchema,
  utm: z.object({ source: z.string().max(60), medium: z.string().max(60), campaign: z.string().max(80) }).partial().optional(),
  path: z.string().max(300).optional(),
});

/** Page-view beacon from realtor sites. De-duplicated per visitor/realtor/estate for 30 minutes. */
publicRouter.post('/touch', touchLimiter, async (req, res) => {
  if (isBot(req)) {
    res.status(204).end();
    return;
  }
  const body = parse(touchInput, typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body);
  const tenant = await Tenant.findOne({ slug: body.firm.toLowerCase(), status: 'active' }).select('_id').lean();
  if (!tenant) {
    res.status(204).end();
    return;
  }
  const realtorId = await resolveRealtor(tenant as unknown as TenantDoc, body.realtor);
  const estate = body.estate ? await Estate.findOne({ tenantId: tenant._id, slug: body.estate.toLowerCase() }).select('_id').lean() : null;
  if (body.vid) {
    const recent = await Touch.exists({ tenantId: tenant._id, vid: body.vid, realtorId, estateId: estate?._id ?? null, at: { $gte: new Date(Date.now() - 30 * 60_000) } });
    if (recent) {
      res.status(204).end();
      return;
    }
  }
  await Touch.create({
    tenantId: tenant._id, realtorId, estateId: estate?._id ?? null, type: 'visit', channel: body.channel ?? 'direct', utm: body.utm,
    vid: body.vid, path: body.path, ipHash: hashIp(req.ip), userAgent: req.get('user-agent')?.slice(0, 200), phone: null,
  });
  res.status(204).end();
});

/**
 * SD-01 short link resolution: rstk.ng/{code}/{estate}. Records the touch server-side, so
 * attribution survives blocked/cleared cookies (§9.4), and returns where to redirect.
 */
publicRouter.post('/shortlink', touchLimiter, async (req, res) => {
  const body = parse(z.object({ code: z.string().max(40), estate: z.string().max(80).optional(), vid: vidSchema, channel: channelSchema }), req.body);
  const code = codeFromShort(body.code);
  if (!code) throw notFound('Link');
  const profiles = await RealtorProfile.find({ code }).setOptions({ crossTenant: true }).select('tenantId userId slug').lean();
  // Codes are unique per firm; if two firms share a code the estate slug disambiguates.
  let match = profiles[0];
  if (profiles.length > 1 && body.estate) {
    for (const p of profiles) {
      if (await Estate.exists({ tenantId: p.tenantId, slug: body.estate.toLowerCase() })) { match = p; break; }
    }
  }
  if (!match) throw notFound('Link');
  const tenant = await Tenant.findById(match.tenantId).select('slug status').lean();
  if (!tenant) throw notFound('Link');
  const user = await User.findOne({ _id: match.userId, tenantId: tenant._id }).select('status').lean();
  const active = user?.status === 'active' && tenant.status === 'active';
  const estate = body.estate ? await Estate.findOne({ tenantId: tenant._id, slug: body.estate.toLowerCase(), published: true }).select('_id slug').lean() : null;
  if (!isBot(req) && tenant.status === 'active') {
    await Touch.create({
      tenantId: tenant._id, realtorId: active ? match.userId : null, estateId: estate?._id ?? null, type: 'shortlink',
      channel: body.channel ?? 'direct', vid: body.vid, ipHash: hashIp(req.ip), userAgent: req.get('user-agent')?.slice(0, 200), phone: null,
    });
  }
  res.json({ firm: tenant.slug, realtor: active ? match.slug : 'main', estate: estate?.slug ?? null });
});

// ---- Lead capture (LC-01..LC-03, LC-08 honeypot) ----------------------------------------------

const leadInput = z.object({
  firm: z.string(),
  realtor: z.string().optional(),
  estate: z.string().optional(),
  productId: z.string().optional(),
  name: z.string().min(2, 'Please enter your name').max(120),
  phone: z.string().min(7, 'Please enter your phone number'),
  email: z.string().email().optional().or(z.literal('')),
  preferredContactTime: z.string().max(60).optional(),
  message: z.string().max(2000).optional(),
  consent: z.literal(true, { message: 'Please agree to be contacted' }),
  vid: vidSchema,
  channel: channelSchema,
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
  path: z.string().max(300).optional(),
});

publicRouter.post('/leads', writeLimiter, async (req, res) => {
  if (req.body?.website) {
    res.json({ ok: true }); // silently drop bots
    return;
  }
  const body = parse(leadInput, req.body);
  const tenant = await activeFirm(body.firm);
  const realtorId = await resolveRealtor(tenant, body.realtor);
  const estate = body.estate ? await Estate.findOne({ tenantId: tenant._id, slug: body.estate.toLowerCase() }).select('_id').lean() : null;
  const { lead, isNew } = await ingestLeadEvent({
    tenant, phone: body.phone, name: body.name, email: body.email || undefined, realtorId, vid: body.vid, channel: body.channel,
    estateId: estate?._id, productId: body.productId, eventType: 'form', message: body.message, preferredContactTime: body.preferredContactTime,
    consent: body.consent, ipHash: hashIp(req.ip), userAgent: req.get('user-agent'), path: body.path,
  });
  res.status(isNew ? 201 : 200).json({ ok: true, leadId: String(lead._id) });
});

/** LC-02: WhatsApp click — logged as a lead event when the buyer leaves a number, else as a touch. */
publicRouter.post('/whatsapp', writeLimiter, async (req, res) => {
  const body = parse(z.object({ firm: z.string(), realtor: z.string().optional(), estate: z.string().optional(), vid: vidSchema, channel: channelSchema, name: z.string().max(120).optional(), phone: z.string().optional(), consent: z.boolean().optional() }), req.body);
  const tenant = await activeFirm(body.firm);
  const realtorId = await resolveRealtor(tenant, body.realtor);
  const estate = body.estate ? await Estate.findOne({ tenantId: tenant._id, slug: body.estate.toLowerCase() }).select('_id').lean() : null;
  if (body.phone) {
    await ingestLeadEvent({ tenant, phone: body.phone, name: body.name, realtorId, vid: body.vid, channel: body.channel, estateId: estate?._id, eventType: 'whatsapp_click', consent: body.consent, ipHash: hashIp(req.ip), userAgent: req.get('user-agent') });
  } else if (!isBot(req)) {
    await Touch.create({ tenantId: tenant._id, realtorId, estateId: estate?._id ?? null, type: 'whatsapp_click', channel: body.channel ?? 'direct', vid: body.vid, ipHash: hashIp(req.ip), phone: null });
  }
  res.json({ ok: true });
});

/** IB-01 / IB-02: book an inspection slot; confirmation on screen + email/SMS. */
publicRouter.post('/bookings', writeLimiter, async (req, res) => {
  if (req.body?.website) {
    res.json({ ok: true });
    return;
  }
  const body = parse(
    z.object({
      firm: z.string(), realtor: z.string().optional(), estate: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/),
      name: z.string().min(2).max(120), phone: z.string().min(7), email: z.string().email().optional().or(z.literal('')), attendees: z.number().int().min(1).max(10).default(1),
      note: z.string().max(500).optional(), consent: z.literal(true, { message: 'Please agree to be contacted' }), vid: vidSchema, channel: channelSchema, website: z.string().max(0).optional(),
    }),
    req.body,
  );
  const tenant = await activeFirm(body.firm);
  const estate = await Estate.findOne({ tenantId: tenant._id, slug: body.estate.toLowerCase(), published: true });
  if (!estate) throw notFound('Estate');
  const slots = await availableSlots(tenant._id, estate);
  const slot = slots.find((s) => s.date === body.date && s.time === body.time);
  if (!slot) throw badRequest('That inspection slot is no longer available. Please choose another.');
  if (slot.remaining !== null && slot.remaining < body.attendees) throw badRequest(`Only ${slot.remaining} seat(s) left for this slot.`);

  const realtorId = await resolveRealtor(tenant, body.realtor);
  const { lead } = await ingestLeadEvent({
    tenant, phone: body.phone, name: body.name, email: body.email || undefined, realtorId, vid: body.vid, channel: body.channel, estateId: estate._id,
    eventType: 'booking', message: body.note, consent: body.consent, ipHash: hashIp(req.ip), userAgent: req.get('user-agent'),
  });
  const booking = await Booking.create({
    tenantId: tenant._id, leadId: lead._id, estateId: estate._id, realtorId: lead.realtorId ?? null, slotAt: new Date(slot.at), dateKey: slot.date, time: slot.time,
    attendees: body.attendees, name: body.name, phone: lead.phone, email: body.email || undefined, note: body.note,
  });

  // Contact shown to the buyer is the realtor credited with the lead (or the firm).
  let contact = { name: tenant.name, phone: tenant.contact?.phone ?? '' };
  if (lead.realtorId) {
    const u = await User.findOne({ tenantId: tenant._id, _id: lead.realtorId }).select('name phone').lean();
    const p = await RealtorProfile.findOne({ tenantId: tenant._id, userId: lead.realtorId }).select('whatsapp').lean();
    if (u) contact = { name: u.name, phone: p?.whatsapp ?? u.phone ?? '' };
  }
  const when = formatLagos(new Date(slot.at), { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const details = {
    estate: estate.name, when, meetingPoint: estate.inspection?.meetingPoint ?? 'To be confirmed by your realtor', transportNotes: estate.inspection?.transportNotes ?? '', contact,
  };
  if (body.email) {
    await sendEmail({
      tenantId: tenant._id, to: body.email, subject: `Inspection booked: ${estate.name}, ${when}`, heading: 'Your site inspection is booked',
      lines: [`Hi ${body.name.split(' ')[0]},`, `Estate: ${estate.name}`, `Date & time: ${when}`, `Meeting point: ${details.meetingPoint}`, ...(details.transportNotes ? [`Transport: ${details.transportNotes}`] : []), `Your contact: ${contact.name} (${contact.phone})`],
      brandColor: tenant.brand?.primaryColor ?? undefined, firmName: tenant.name, template: 'booking.confirmation',
    });
  }
  await sendSms(lead.phone, `${tenant.name}: inspection at ${estate.name} on ${when}. Meet: ${details.meetingPoint}. Contact ${contact.name} ${contact.phone}`, tenant._id);
  res.status(201).json({ ok: true, bookingId: String(booking._id), ...details });
});

publicRouter.post('/report', writeLimiter, async (req, res) => {
  const body = parse(z.object({ firm: z.string().optional(), url: z.string().max(500), reason: z.string().min(5).max(2000), contact: z.string().max(120).optional() }), req.body);
  const tenant = body.firm ? await Tenant.findOne({ slug: body.firm.toLowerCase() }).select('_id').lean() : null;
  await AbuseReport.create({ tenantId: tenant?._id ?? null, url: body.url, reason: body.reason, contact: body.contact, ipHash: hashIp(req.ip) });
  res.status(201).json({ ok: true });
});
