import slugifyLib from 'slugify';

const slugify = slugifyLib as unknown as (s: string, o?: object) => string;

/** Slugs that collide with site routes or subdomains. "main" is the firm's own (house) site. */
export const RESERVED_SLUGS = new Set(['main', 'www', 'app', 'api', 'admin', 'l', 's', 'media', 'static', 'login', 'join', 'register']);

export function toSlug(input: string) {
  return slugify(input, { lower: true, strict: true, trim: true }).slice(0, 60) || 'item';
}

/** Returns a slug not rejected by `exists`, appending -2, -3... when needed. */
export async function uniqueSlug(base: string, exists: (s: string) => Promise<boolean>) {
  const root = toSlug(base);
  let candidate = RESERVED_SLUGS.has(root) ? `${root}-1` : root;
  let i = 2;
  while (RESERVED_SLUGS.has(candidate) || (await exists(candidate))) candidate = `${root}-${i++}`;
  return candidate;
}
