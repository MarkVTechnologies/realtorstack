import nodemailer, { type Transporter } from 'nodemailer';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { MessageLog } from '../models/index.js';
import { enqueue, registerJob } from './queue.js';

let transport: Transporter | null = null;
function getTransport() {
  if (!env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transport;
}

export interface EmailInput {
  tenantId?: Types.ObjectId | string | null;
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  brandColor?: string;
  firmName?: string;
  template: string;
}

function renderHtml(e: EmailInput) {
  const color = e.brandColor ?? '#0f5132';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:${color};color:#fff;padding:18px 24px;font-size:16px;font-weight:bold">${esc(e.firmName ?? 'RealtorStack')}</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${esc(e.heading)}</h1>
${e.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join('')}
${e.cta ? `<p style="margin:24px 0 8px"><a href="${esc(e.cta.url)}" style="background:${color};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${esc(e.cta.label)}</a></p>` : ''}
</td></tr><tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;border-top:1px solid #eee">Sent by RealtorStack on behalf of ${esc(e.firmName ?? 'your firm')}.</td></tr>
</table></td></tr></table></body></html>`;
}

registerJob('email.send', async ({ logId, input }: { logId: string; input: EmailInput }) => {
  const t = getTransport();
  const text = [input.heading, '', ...input.lines, input.cta ? `\n${input.cta.label}: ${input.cta.url}` : ''].join('\n');
  if (!t) {
    if (!env.isTest) console.log(`\n[email] → ${input.to}\n  Subject: ${input.subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
    await MessageLog.updateOne({ _id: logId }, { status: 'logged', $inc: { attempts: 1 } });
    return;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to: input.to, subject: input.subject, text, html: renderHtml(input) });
    await MessageLog.updateOne({ _id: logId }, { status: 'sent', $inc: { attempts: 1 } });
  } catch (err) {
    await MessageLog.updateOne({ _id: logId }, { status: 'failed', error: String(err), $inc: { attempts: 1 } });
    throw err;
  }
});

export async function sendEmail(input: EmailInput) {
  if (!input.to) return;
  const log = await MessageLog.create({ tenantId: input.tenantId ?? null, channel: 'email', to: input.to, subject: input.subject, template: input.template });
  await enqueue('email.send', { logId: String(log._id), input });
}

/** SMS placeholder (Termii in Phase 2). In development the message is logged so OTP flows work. */
export async function sendSms(to: string, message: string, tenantId?: Types.ObjectId | null) {
  await MessageLog.create({ tenantId: tenantId ?? null, channel: 'sms', to, subject: message.slice(0, 60), template: 'sms', status: 'logged' });
  if (!env.isTest) console.log(`[sms] → ${to}: ${message}`);
}
