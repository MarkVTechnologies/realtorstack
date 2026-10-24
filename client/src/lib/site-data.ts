import { cacheLife, cacheTag } from "next/cache";

/**
 * Cached data access for public realtor sites. Pages are cached per firm and invalidated by the
 * API (POST /api/revalidate) whenever prices, estates, branding or a realtor's profile change.
 */

const API = process.env.API_URL ?? "http://localhost:4000";

export interface Brand { primaryColor?: string; accentColor?: string; theme?: string }
export interface PublicFirm {
  name: string; slug: string; logoUrl?: string; brand?: Brand; cacNumber?: string; status: string;
  contact?: { phone?: string; whatsapp?: string; email?: string; address?: string; website?: string };
  site: { heroTitle?: string; heroSubtitle?: string; whyBuy: { title: string; text: string }[]; faqs: { q: string; a: string }[]; mandatorySections: string[] };
  hasPrivacyPolicy: boolean;
}
export interface MediaImage { url: string; variants?: { sm?: string; md?: string; lg?: string; og?: string }; width?: number; height?: number; alt?: string }
export interface Location { state: string; lga?: string; area?: string; address?: string; lat?: number; lng?: number }
export interface EstateSummary {
  id: string; name: string; slug: string; tagline?: string; status: string; location: Location; documents: string[]; amenities: string[];
  cover: MediaImage | null; fromPrice: number | null; minDeposit: number | null; hasPromo: boolean; productCount: number; updatedAt: string;
}
export interface Plan { name: string; depositAmount: number; tenorMonths: number; monthlyAmount: number; totalPrice: number }
export interface PublicProduct {
  id: string; name: string; type: string; size?: string; status: string; outrightPrice: number; price: number;
  promo: { label?: string; endsAt?: string; price?: number } | null; plans: Plan[];
}
export interface EstateDetail extends Omit<EstateSummary, "cover" | "fromPrice" | "minDeposit" | "hasPromo" | "productCount"> {
  description: string;
  media: { images: MediaImage[]; videos: { url: string; title?: string }[]; sitePlanUrl?: string; brochureUrl?: string };
  inspection: { days: number[]; times: string[]; meetingPoint?: string; transportNotes?: string };
  products: PublicProduct[];
}
export interface PublicRealtor {
  name: string; slug: string; code?: string; phone?: string; whatsapp?: string; photoUrl?: string; bio?: string | null;
  areasServed?: string[]; testimonials?: { name: string; text: string }[]; featuredEstateIds?: string[];
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}/api/public${path}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export async function getFirmSite(firm: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`firm:${firm}`);
  return getJson<{ firm: PublicFirm; estates: EstateSummary[] }>(`/sites/${encodeURIComponent(firm)}`);
}

export async function getRealtor(firm: string, realtor: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`firm:${firm}`, `realtor:${firm}:${realtor}`);
  return getJson<{ active: boolean; house: boolean; realtor: PublicRealtor }>(`/sites/${encodeURIComponent(firm)}/realtors/${encodeURIComponent(realtor)}`);
}

export async function getEstate(firm: string, estate: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`firm:${firm}`);
  return getJson<{ firm: PublicFirm; estate: EstateDetail }>(`/sites/${encodeURIComponent(firm)}/estates/${encodeURIComponent(estate)}`);
}

export async function getPrivacy(firm: string) {
  "use cache";
  cacheLife("days");
  cacheTag(`firm:${firm}`);
  return getJson<{ firm: PublicFirm; privacyPolicy: string | null }>(`/sites/${encodeURIComponent(firm)}/privacy`);
}

export async function getSitemap(firm: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`firm:${firm}`);
  return getJson<{ estates: { slug: string; updatedAt: string }[]; realtors: { slug: string; updatedAt: string }[] }>(`/sites/${encodeURIComponent(firm)}/sitemap`);
}

/** Load everything a realtor site page needs. */
export async function loadSite(firm: string, realtor: string) {
  const [site, r] = await Promise.all([getFirmSite(firm), getRealtor(firm, realtor)]);
  if (!site || !r) return null;
  return { ...site, realtor: r };
}
