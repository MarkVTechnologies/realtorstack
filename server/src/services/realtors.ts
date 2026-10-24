import type { Types } from 'mongoose';
import { Invite, RealtorProfile, Tenant, User, type TenantDoc } from '../models/index.js';
import { env } from '../config/env.js';
import { randomToken, sha256, mask } from '../lib/crypto.js';
import { uniqueSlug } from '../lib/slug.js';
import { normalizePhone } from '../lib/phone.js';
import { badRequest } from '../lib/errors.js';
import { sendEmail, sendSms } from './mailer.js';

/** Realtor site URL — subdomain when ROOT_DOMAIN is configured, else path-based fallback (§11.2). */
export function realtorSiteUrl(firmSlug: string, realtorSlug: string) {
  if (env.ROOT_DOMAIN) return `https://${realtorSlug}.${firmSlug}.${env.ROOT_DOMAIN}`;
  return `${env.CLIENT_URL}/s/${firmSlug}/${realtorSlug}`;
}

export function firmSiteUrl(firmSlug: string) {
  if (env.ROOT_DOMAIN) return `https://${firmSlug}.${env.ROOT_DOMAIN}`;
  return `${env.CLIENT_URL}/s/${firmSlug}/main`;
}

/** Short share link: rstk.ng/{code}/{estate} (SD-01). The code drops its dash: TOBI-042 → tobi042. */
export function shortCode(code: string) {
  return code.replace(/-/g, '').toLowerCase();
}

export function shortLink(code: string, estateSlug?: string, channel?: string) {
  const base = `${env.SHORT_LINK_BASE}/${shortCode(code)}${estateSlug ? `/${estateSlug}` : ''}`;
  return channel ? `${base}?c=${channel}` : base;
}

/** "tobi042" | "TOBI-042" → "TOBI-042" */
export function codeFromShort(input: string) {
  const m = /^([a-z]+)-?(\d+)$/i.exec(input.trim());
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

async function nextRealtorCode(tenantId: Types.ObjectId, name: string) {
  const t = await Tenant.findByIdAndUpdate(tenantId, { $inc: { realtorSeq: 1 } }, { returnDocument: 'after' }).select('realtorSeq').lean();
  const prefix = (name.split(/\s+/)[0] ?? 'REALTOR').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 6) || 'RS';
  return `${prefix}-${String(t?.realtorSeq ?? 1).padStart(3, '0')}`;
}

export interface CreateRealtorInput {
  tenant: TenantDoc;
  name: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  status: 'invited' | 'pending' | 'active';
  source: 'invite' | 'csv' | 'registration_link' | 'admin';
}

/** Creates the realtor's user + profile with a unique code (RM-04) and site slug. */
export async function createRealtor(input: CreateRealtorInput) {
  const { tenant } = input;
  const name = input.name.trim();
  if (!name) throw badRequest('Name is required');
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw badRequest(`Invalid phone number: ${input.phone}`);
  const email = input.email?.trim().toLowerCase() || undefined;
  if (!phone && !email) throw badRequest('A phone number or email is required');

  const user = await User.create({
    tenantId: tenant._id,
    role: 'realtor',
    name,
    phone: phone ?? undefined,
    email,
    status: input.status,
    phoneVerifiedAt: input.status === 'active' && input.source === 'registration_link' ? new Date() : undefined,
  });
  try {
    const code = await nextRealtorCode(tenant._id, name);
    const slug = await uniqueSlug(name, async (s) => !!(await RealtorProfile.exists({ tenantId: tenant._id, slug: s })));
    const profile = await RealtorProfile.create({
      tenantId: tenant._id,
      userId: user._id,
      code,
      slug,
      whatsapp: normalizePhone(input.whatsapp) ?? phone ?? undefined,
      source: input.source,
      activatedAt: input.status === 'active' ? new Date() : undefined,
    });
    return { user, profile };
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
}

export async function createInvite(tenantId: Types.ObjectId, userId: Types.ObjectId, invitedBy?: Types.ObjectId) {
  const token = randomToken(24);
  await Invite.updateMany({ tenantId, userId, usedAt: null }, { $set: { expiresAt: new Date() } });
  await Invite.create({ tenantId, userId, tokenHash: sha256(token), invitedBy, expiresAt: new Date(Date.now() + 14 * 86_400_000) });
  return { token, url: `${env.CLIENT_URL}/join/${token}` };
}

/** RM-01 / NT-01: deliver an invite by email and/or SMS. */
export async function deliverInvite(tenant: TenantDoc, user: { name: string; email?: string | null; phone?: string | null; role: string }, url: string) {
  const isRealtor = user.role === 'realtor';
  const heading = isRealtor ? `${tenant.name} has created your realtor website` : `You've been invited to ${tenant.name} on RealtorStack`;
  const lines = isRealtor
    ? [`Hi ${user.name.split(' ')[0]},`, `${tenant.name} uses RealtorStack to give every realtor a ready-made sales website with all our estates, prices and payment plans.`, 'Verify your phone number to activate your site and start sharing links. Every lead from your links is credited to you.']
    : [`Hi ${user.name.split(' ')[0]},`, `You've been added to the ${tenant.name} workspace as ${user.role.replace('_', ' ')}.`, 'Accept the invite to set your password.'];
  if (user.email) {
    await sendEmail({ tenantId: tenant._id, to: user.email, subject: heading, heading, lines, cta: { label: isRealtor ? 'Activate my site' : 'Accept invite', url }, brandColor: tenant.brand?.primaryColor ?? undefined, firmName: tenant.name, template: 'invite' });
  }
  if (user.phone && isRealtor) {
    await sendSms(user.phone, `${tenant.name}: your realtor website is ready. Activate it here: ${url}`, tenant._id);
  }
}

/** Shape a realtor profile for API responses — sensitive fields are always masked. */
export function serializeProfile(profile: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };
  return {
    ...p,
    bank: p.bank ? { bankName: p.bank.bankName, accountName: p.bank.accountName, accountNumberMasked: p.bank.accountLast4 ? mask(`000000${p.bank.accountLast4}`) : '' } : undefined,
    kyc: p.kyc ? { idType: p.kyc.idType, idNumberMasked: p.kyc.idLast4 ? `****${p.kyc.idLast4}` : '' } : undefined,
    shortCode: shortCode(p.code),
  };
}
