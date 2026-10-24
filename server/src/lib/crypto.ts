import crypto from 'node:crypto';
import { env } from '../config/env.js';

function key() {
  if (/^[0-9a-f]{64}$/i.test(env.FIELD_ENCRYPTION_KEY)) return Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
  // Dev fallback: derive from the JWT secret so encryption still works locally.
  return crypto.createHash('sha256').update(`field:${env.JWT_SECRET}`).digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptField(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function mask(value: string | undefined | null, visible = 4) {
  if (!value) return '';
  return value.length <= visible ? '*'.repeat(value.length) : `${'*'.repeat(value.length - visible)}${value.slice(-visible)}`;
}

export function hashIp(ip: string | undefined) {
  if (!ip) return undefined;
  return crypto.createHash('sha256').update(`${ip}:${env.JWT_SECRET}`).digest('hex').slice(0, 32);
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex');
}
