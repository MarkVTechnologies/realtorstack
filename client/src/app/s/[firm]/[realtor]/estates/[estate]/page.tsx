import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LuArrowLeft, LuBus, LuCalendarCheck, LuClock, LuFileText, LuMapPin, LuNavigation, LuPlay, LuShieldCheck } from "react-icons/lu";
import { getEstate, getRealtor } from "@/lib/site-data";
import { siteBase, siteOrigin, APP_URL } from "@/lib/urls";
import { formatNaira, formatNairaShort, locationLine, WEEKDAYS } from "@/lib/format";
import { amenityIcon, EstateStatus, PriceTable, RealtorPhoto, SectionHeading, SiteSkeleton } from "@/components/site/parts";
import { EstateGallery } from "@/components/site/EstateGallery";
import { PlanExplorer } from "@/components/site/PlanExplorer";
import { LeadForm } from "@/components/site/LeadForm";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";
import { SiteTracker } from "@/components/site/SiteTracker";
import { Reveal } from "@/components/site/Reveal";

type Params = Promise<{ firm: string; realtor: string; estate: string }>;

async function load(params: Params) {
  const { firm, realtor, estate } = await params;
  const [e, r] = await Promise.all([getEstate(firm, estate), getRealtor(firm, realtor)]);
  if (!e || !r) return null;
  return { ...e, firm, realtor, slug: estate, firmData: e.firm, r };
}

/** SD-02: rich previews on WhatsApp/Facebook/X/LinkedIn — image, name, price and realtor name. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load(params);
  if (!d) return {};
  const from = d.estate.products.length ? Math.min(...d.estate.products.map((p) => p.price)) : null;
  const who = d.r.house ? d.firmData.name : d.r.realtor.name;
  const title = `${d.estate.name} — from ${formatNairaShort(from)} | ${who}`;
  const description = `${locationLine(d.estate.location)}. ${d.estate.documents.join(", ")}. ${d.estate.tagline ?? "Flexible payment plans available."} Contact ${who}.`;
  const url = `${siteOrigin(d.firm, d.realtor)}/estates/${d.slug}`;
  const og = `${APP_URL}/og/${d.firm}/${d.realtor}/${d.slug}`;
  return {
    title: { absolute: title },
    description,
    // RS-07: canonical points at the firm's main estate page to avoid duplicate content across realtor sites
    alternates: { canonical: `${siteOrigin(d.firm, "main")}/estates/${d.slug}` },
    openGraph: { title, description, url, type: "website", siteName: d.firmData.name, images: [{ url: og, width: 1200, height: 630, alt: d.estate.name }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default function EstatePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Estate params={params} />
    </Suspense>
  );
}

function youtubeId(url: string) {
  return /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url)?.[1];
}

async function Estate({ params }: { params: Params }) {
  const d = await load(params);
  if (!d) notFound();
  const { estate, firmData, r } = d;
  const base = siteBase(d.firm, d.realtor);
  const realtor = r.realtor;
  const whatsapp = realtor.whatsapp ?? firmData.contact?.whatsapp;
  const images = estate.media.images ?? [];
  const from = estate.products.length ? Math.min(...estate.products.map((p) => p.price)) : null;
  const minDeposit = Math.min(...estate.products.flatMap((p) => p.plans.map((pl) => pl.depositAmount)), Infinity);
  const mapQuery = estate.location.lat && estate.location.lng ? `${estate.location.lat},${estate.location.lng}` : `${estate.name} ${locationLine(estate.location)}`;
  const bookHref = `${base}/book?estate=${d.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: estate.name,
    description: estate.tagline ?? estate.description.slice(0, 300),
    url: `${siteOrigin(d.firm, "main")}/estates/${d.slug}`,
    image: images.map((i) => { const u = i.variants?.lg ?? i.url; return u.startsWith("http") ? u : `${APP_URL}${u}`; }),
    datePosted: estate.updatedAt,
    offers: estate.products.map((p) => ({ "@type": "Offer", name: p.name, price: p.price, priceCurrency: "NGN", availability: p.status === "sold_out" ? "https://schema.org/SoldOut" : "https://schema.org/InStock" })),
    address: { "@type": "PostalAddress", addressLocality: estate.location.area ?? estate.location.lga, addressRegion: estate.location.state, addressCountry: "NG", streetAddress: estate.location.address },
    ...(estate.location.lat ? { geo: { "@type": "GeoCoordinates", latitude: estate.location.lat, longitude: estate.location.lng } } : {}),
  };

  const contactCard = (
    <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-lift)] ring-1 ring-gray-200">
      <div className="mb-5 flex items-center gap-3">
        <RealtorPhoto realtor={realtor} size={52} className="ring-2 ring-brand-soft" />
        <div className="min-w-0">
          <p className="truncate font-bold text-gray-950">{realtor.name}</p>
          <p className="truncate text-xs text-gray-500">{r.house ? "Sales team" : `Realtor · ${firmData.name}`}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {whatsapp && <WhatsAppButton firm={d.firm} realtor={d.realtor} estate={d.slug} estateName={estate.name} whatsapp={whatsapp} realtorName={realtor.name} />}
        <Link href={bookHref} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-brand px-5 py-3 font-semibold text-brand transition hover:bg-brand-soft"><LuCalendarCheck /> Book free inspection</Link>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-gray-400"><span className="h-px flex-1 bg-gray-200" />or send an enquiry<span className="h-px flex-1 bg-gray-200" /></div>
      <LeadForm firm={d.firm} realtor={d.realtor} estate={d.slug} products={estate.products.map((p) => ({ id: p.id, name: p.name }))} realtorName={realtor.name} whatsapp={whatsapp} privacyHref={`${base}/privacy`} compact heading="" />
    </div>
  );

  return (
    <main className="pb-24 lg:pb-0">
      <SiteTracker firm={d.firm} realtor={d.realtor} estate={d.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className="mx-auto max-w-6xl px-4 pt-5">
        <Link href={`${base}/estates`} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-brand"><LuArrowLeft /> All properties</Link>
      </div>

      <div className="mx-auto mt-4 grid max-w-6xl gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <EstateGallery images={images} name={estate.name} />

          {/* Title + headline price */}
          <div className="mt-7 animate-fade-up">
            <div className="flex flex-wrap items-center gap-2">
              <EstateStatus status={estate.status} />
              {estate.documents.map((doc) => <span key={doc} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong"><LuShieldCheck /> {doc}</span>)}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-950 sm:text-[42px] sm:leading-[1.1]">{estate.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-gray-600"><LuMapPin className="text-brand" />{locationLine(estate.location)}</p>
            {estate.tagline && <p className="mt-4 text-lg leading-relaxed text-gray-800">{estate.tagline}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="rounded-2xl bg-brand-deep px-5 py-4 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Price from</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{formatNaira(from)}</p>
              </div>
              {Number.isFinite(minDeposit) && (
                <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-gray-200">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deposit from</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-gray-950">{formatNaira(minDeposit)}</p>
                </div>
              )}
            </div>
          </div>

          <section className="mt-14" aria-labelledby="pricing-h">
            <SectionHeading id="pricing-h" eyebrow="Prices & payment plans" title="Pick a plot, pick a plan" />
            <div className="mt-6"><PlanExplorer products={estate.products} /></div>
            {estate.products.length > 0 && (
              <details className="group mt-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-brand">See the full price list <span className="inline-block transition group-open:rotate-90">›</span></summary>
                <div className="mt-3"><PriceTable products={estate.products} /></div>
              </details>
            )}
          </section>

          {estate.documents.length > 0 && (
            <Reveal as="section" className="mt-14">
              <SectionHeading eyebrow="Verified" title="Title & documents" />
              <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                {estate.documents.map((doc) => (
                  <li key={doc} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700"><LuShieldCheck /></span>
                    <span className="font-semibold text-gray-900">{doc}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {estate.description && (
            <Reveal as="section" className="mt-14">
              <SectionHeading eyebrow="Overview" title="About this estate" />
              <div className="mt-5 space-y-4 whitespace-pre-line text-[17px] leading-relaxed text-gray-700">{estate.description}</div>
            </Reveal>
          )}

          {estate.amenities.length > 0 && (
            <Reveal as="section" className="mt-14">
              <SectionHeading eyebrow="Living here" title="Amenities" />
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {estate.amenities.map((a) => {
                  const Icon = amenityIcon(a);
                  return (
                    <li key={a} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 text-sm font-medium text-gray-800 ring-1 ring-gray-200/80">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon /></span>{a}
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          )}

          {estate.media.videos?.length > 0 && (
            <Reveal as="section" className="mt-14">
              <SectionHeading eyebrow="Watch" title="Videos & drone footage" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {estate.media.videos.map((v) => {
                  const id = youtubeId(v.url);
                  return id ? (
                    // Lightweight facade: thumbnail link instead of a heavy iframe
                    <a key={v.url} href={v.url} target="_blank" rel="noopener" className="group relative block aspect-video overflow-hidden rounded-2xl bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={v.title ?? "Estate video"} loading="lazy" className="h-full w-full object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-90" />
                      <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-xl text-gray-950 shadow-xl"><LuPlay /></span></span>
                      {v.title && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-3 text-sm font-semibold text-white">{v.title}</span>}
                    </a>
                  ) : (
                    <a key={v.url} href={v.url} target="_blank" rel="noopener" className="rounded-2xl bg-white p-4 font-medium underline ring-1 ring-gray-200">{v.title ?? v.url}</a>
                  );
                })}
              </div>
            </Reveal>
          )}

          <Reveal as="section" className="mt-14">
            <SectionHeading eyebrow="Visit" title="Location & inspection" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 ring-1 ring-gray-200">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-950"><LuMapPin className="text-brand" /> Address</p>
                <p className="mt-2 text-gray-700">{estate.location.address ?? locationLine(estate.location)}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white"><LuNavigation /> Directions</a>
              </div>
              <div className="rounded-3xl bg-brand-soft p-6 ring-1 ring-[color-mix(in_srgb,var(--brand)_15%,white)]">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-950"><LuCalendarCheck className="text-brand" /> Free inspections</p>
                {estate.inspection.days.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-gray-700"><LuClock className="shrink-0" /> {estate.inspection.days.map((n) => WEEKDAYS[n]).join(", ")} · {estate.inspection.times.join(", ")}</p>}
                {estate.inspection.meetingPoint && <p className="mt-1.5 flex gap-1.5 text-gray-700"><LuMapPin className="mt-1 shrink-0" /> {estate.inspection.meetingPoint}</p>}
                {estate.inspection.transportNotes && <p className="mt-1.5 flex gap-1.5 text-gray-700"><LuBus className="mt-1 shrink-0" /> {estate.inspection.transportNotes}</p>}
                <Link href={bookHref} className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">Choose a date</Link>
              </div>
            </div>
            {(estate.media.sitePlanUrl || estate.media.brochureUrl) && (
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {estate.media.sitePlanUrl && <a href={estate.media.sitePlanUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-medium ring-1 ring-gray-300 hover:ring-gray-400"><LuFileText /> Site plan (PDF)</a>}
                {estate.media.brochureUrl && <a href={estate.media.brochureUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-medium ring-1 ring-gray-300 hover:ring-gray-400"><LuFileText /> Brochure (PDF)</a>}
              </div>
            )}
          </Reveal>

          {/* Contact card inline on mobile */}
          <div className="mt-14 lg:hidden" id="enquire">{contactCard}</div>
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start" aria-label="Contact the realtor">{contactCard}</aside>
      </div>

      {/* Sticky mobile action bar */}
      <div data-sticky-cta className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.2)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">From</p>
            <p className="truncate text-lg font-bold leading-tight text-gray-950">{formatNairaShort(from)}</p>
          </div>
          <Link href={bookHref} className="rounded-2xl border-2 border-brand px-3.5 py-2.5 text-sm font-semibold text-brand">Inspect</Link>
          {whatsapp && <div className="w-36"><WhatsAppButton firm={d.firm} realtor={d.realtor} estate={d.slug} estateName={estate.name} whatsapp={whatsapp} realtorName={realtor.name} label="WhatsApp" /></div>}
        </div>
      </div>
    </main>
  );
}
