import { env } from '../config/env.js';

/**
 * Public realtor sites are cached by the Next.js client (`use cache` + cacheTag).
 * After any change that affects them (prices, estates, branding, realtor profile) we ask the
 * client to expire the firm's tag so updates propagate to every realtor site (PC-04).
 */
export function revalidateFirm(firmSlug: string, extraTags: string[] = []) {
  if (env.isTest || !env.REVALIDATE_SECRET) return;
  const tags = [`firm:${firmSlug}`, ...extraTags];
  fetch(`${env.CLIENT_URL}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.warn(`[revalidate] failed for ${tags.join(',')}: ${err.message}`));
}
