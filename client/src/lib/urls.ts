const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Base path for links inside a realtor site. With ROOT_DOMAIN the site lives on its own
 * subdomain (links start at "/"); otherwise it is served under /s/{firm}/{realtor}.
 */
export function siteBase(firm: string, realtor: string) {
  return ROOT_DOMAIN ? "" : `/s/${firm}/${realtor}`;
}

export function siteOrigin(firm: string, realtor: string) {
  if (!ROOT_DOMAIN) return `${APP_URL}/s/${firm}/${realtor}`;
  return realtor === "main" ? `https://${firm}.${ROOT_DOMAIN}` : `https://${realtor}.${firm}.${ROOT_DOMAIN}`;
}

/** Absolute URL for API-served media ("/media/…") — required for Open Graph images. */
export function absoluteMedia(url?: string | null) {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${APP_URL}${url}`;
}
