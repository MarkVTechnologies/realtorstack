import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { badRequest } from '../lib/errors.js';

export const UPLOAD_DIR = path.resolve('uploads');

const IMAGE_WIDTHS = { sm: 480, md: 960, lg: 1600 } as const;

function publicUrl(key: string) {
  // Relative "/media/..." URLs are proxied by the client to this API, keeping images same-origin.
  return `${env.MEDIA_BASE_URL}/media/${key}`;
}

async function put(key: string, body: Buffer) {
  if (env.STORAGE_DRIVER !== 'local') {
    // S3-compatible storage (Cloudflare R2, AWS S3, DO Spaces) can be plugged in here.
    throw new Error(`Storage driver "${env.STORAGE_DRIVER}" is not configured`);
  }
  const file = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

/**
 * PC-03: images are auto-compressed and served as WebP in three responsive sizes.
 */
export async function storeImage(tenantId: string, buffer: Buffer) {
  const img = sharp(buffer, { failOn: 'error' }).rotate();
  const meta = await img.metadata().catch(() => null);
  if (!meta?.width) throw badRequest('Unsupported or corrupt image');
  const id = nanoid(12);
  const variants: Record<string, string> = {};
  for (const [name, width] of Object.entries(IMAGE_WIDTHS)) {
    const out = await sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: name === 'sm' ? 70 : 76 }).toBuffer();
    const key = `${tenantId}/img/${id}-${name}.webp`;
    await put(key, out);
    variants[name] = publicUrl(key);
  }
  // JPEG 1200×630 for Open Graph cards: WhatsApp/Facebook previews and the OG image renderer need JPEG/PNG.
  const og = await sharp(buffer).rotate().resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const ogKey = `${tenantId}/img/${id}-og.jpg`;
  await put(ogKey, og);
  variants.og = publicUrl(ogKey);
  const ratio = meta.height && meta.width ? meta.height / meta.width : 0.66;
  const lgWidth = Math.min(meta.width, IMAGE_WIDTHS.lg);
  return { url: variants.lg, variants, width: lgWidth, height: Math.round(lgWidth * ratio) };
}

export async function storeDocument(tenantId: string, buffer: Buffer, originalName: string) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.pdf') throw badRequest('Only PDF documents are supported');
  if (buffer.subarray(0, 4).toString() !== '%PDF') throw badRequest('File is not a valid PDF');
  const key = `${tenantId}/docs/${nanoid(12)}.pdf`;
  await put(key, buffer);
  return { url: publicUrl(key) };
}
