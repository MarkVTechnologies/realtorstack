import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LuArrowRight, LuBadgeCheck, LuCalendarCheck, LuQuote, LuShieldCheck, LuWallet } from "react-icons/lu";
import { loadSite } from "@/lib/site-data";
import { absoluteMedia, siteBase, siteOrigin } from "@/lib/urls";
import { formatNairaShort } from "@/lib/format";
import { EstateCard, RealtorPhoto, SectionHeading, SiteImage, SiteSkeleton } from "@/components/site/parts";
import { LeadForm } from "@/components/site/LeadForm";
import { SiteTracker } from "@/components/site/SiteTracker";
import { Reveal } from "@/components/site/Reveal";

type Params = Promise<{ firm: string; realtor: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) return {};
  const name = data.realtor.house ? data.firm.name : `${data.realtor.realtor.name} · ${data.firm.name}`;
  const from = Math.min(...data.estates.map((e) => e.fromPrice ?? Infinity));
  const description = `${data.estates.length} estates from ${Number.isFinite(from) ? formatNairaShort(from) : "great prices"} with flexible payment plans. ${data.firm.site.heroSubtitle ?? ""}`.trim();
  const cover = data.estates[0]?.cover;
  return {
    title: { absolute: name },
    description,
    alternates: { canonical: siteOrigin(firm, realtor) },
    openGraph: { title: name, description, type: "website", url: siteOrigin(firm, realtor), images: cover ? [{ url: absoluteMedia(cover.variants?.og ?? cover.url)!, width: 1200, height: 630 }] : [] },
  };
}

export default function RealtorHome({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

const WHY_ICONS = [LuShieldCheck, LuWallet, LuCalendarCheck, LuBadgeCheck];

async function Home({ params }: { params: Params }) {
  const { firm: firmSlug, realtor: realtorSlug } = await params;
  const data = await loadSite(firmSlug, realtorSlug);
  if (!data) notFound();
  const { firm, estates, realtor: r } = data;
  const realtor = r.realtor;
  const base = siteBase(firmSlug, realtorSlug);

  // Realtor's featured order first (RS-03), then the rest
  const order = new Map((realtor.featuredEstateIds ?? []).map((id, i) => [id, i]));
  const sorted = [...estates].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const heroEstate = sorted.find((e) => e.cover) ?? sorted[0];
  const site = firm.site;
  const fromPrice = Math.min(...estates.map((e) => e.fromPrice ?? Infinity));
  const minDeposit = Math.min(...estates.map((e) => e.minDeposit ?? Infinity));
  const docs = [...new Set(estates.flatMap((e) => e.documents))];
  const firstName = realtor.name.split(" ")[0];

  return (
    <main>
      <SiteTracker firm={firmSlug} realtor={realtorSlug} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-gray-950">
        <SiteImage image={heroEstate?.cover} alt={heroEstate?.name ?? firm.name} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-gray-950/90 via-gray-950/70 to-gray-950/30" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-gray-950/60 to-transparent" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-14 sm:pt-20 md:grid-cols-[1.35fr_1fr] md:items-center lg:pb-28">
          <div className="animate-fade-up text-white">
            {!r.house && (
              <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 ring-1 ring-white/20 backdrop-blur">
                <RealtorPhoto realtor={realtor} size={40} className="ring-2 ring-white/70" />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{realtor.name}</p>
                  <p className="text-xs text-white/75">Accredited realtor · {firm.name}</p>
                </div>
              </div>
            )}
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{site.heroTitle ?? `Find your next property with ${firm.name}`}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">{site.heroSubtitle ?? "Verified titles, transparent prices and flexible payment plans."}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`${base}/estates`} className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 font-semibold text-brand-ink shadow-lg shadow-black/20 transition hover:brightness-110">View properties <LuArrowRight /></Link>
              <Link href={`${base}/book`} className="rounded-full bg-white px-6 py-3.5 font-semibold text-gray-950 shadow-lg shadow-black/10 transition hover:bg-gray-100">Book free inspection</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              {docs.slice(0, 2).map((d) => <li key={d} className="flex items-center gap-1.5"><LuShieldCheck className="text-emerald-300" /> {d}</li>)}
              <li className="flex items-center gap-1.5"><LuCalendarCheck className="text-emerald-300" /> Free site inspections</li>
              <li className="flex items-center gap-1.5"><LuWallet className="text-emerald-300" /> Installment plans</li>
            </ul>
          </div>
          <div className="hidden animate-fade-up rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/5 [animation-delay:120ms] md:block">
            <LeadForm firm={firmSlug} realtor={realtorSlug} realtorName={realtor.name} whatsapp={realtor.whatsapp} privacyHref={`${base}/privacy`} compact heading={`Talk to ${r.house ? "our sales team" : firstName}`} />
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4">
        <dl className="grid grid-cols-2 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-lift)] ring-1 ring-gray-200 sm:grid-cols-4">
          {[
            { k: "Estates", v: String(estates.length) },
            { k: "Prices from", v: Number.isFinite(fromPrice) ? formatNairaShort(fromPrice) : "—" },
            { k: "Deposit from", v: Number.isFinite(minDeposit) ? formatNairaShort(minDeposit) : "—" },
            { k: "Inspection", v: "Free" },
          ].map((s, i) => (
            <div key={s.k} className={`px-5 py-5 text-center ${i > 0 ? "border-l border-gray-100" : ""} ${i > 1 ? "border-t border-gray-100 sm:border-t-0" : ""}`}>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{s.k}</dt>
              <dd className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Estates */}
      <section className="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="estates-h">
        <SectionHeading id="estates-h" eyebrow="Available now" title="Properties you can buy today"
          action={<Link href={`${base}/estates`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:gap-2">See all <LuArrowRight /></Link>} />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.slice(0, 6).map((e, i) => (
            i < 3 ? <EstateCard key={e.id} estate={e} href={`${base}/estates/${e.slug}`} priority={i === 0} /> : <Reveal key={e.id} delay={(i - 3) * 80}><EstateCard estate={e} href={`${base}/estates/${e.slug}`} /></Reveal>
          ))}
        </div>
        {sorted.length === 0 && <p className="mt-6 text-gray-600">New estates are coming soon.</p>}
      </section>

      {/* Why buy */}
      {site.whyBuy.length > 0 && (
        <section className="mt-20 bg-brand-soft py-20" aria-labelledby="why-h">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading id="why-h" eyebrow="Peace of mind" title={`Why buy with ${firm.name}`} />
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {site.whyBuy.map((w, i) => {
                const Icon = WHY_ICONS[i % WHY_ICONS.length];
                return (
                  <Reveal key={w.title} delay={i * 90}>
                    <div className="h-full rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-xl text-brand-ink"><Icon /></span>
                      <h3 className="mt-5 text-lg font-bold text-gray-950">{w.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">{w.text}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* About the realtor */}
      {!r.house && (
        <section className="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="me-h">
          <Reveal>
            <div className="grid items-center gap-8 rounded-[2rem] bg-gray-950 p-8 text-white sm:p-12 md:grid-cols-[auto_1fr]">
              <RealtorPhoto realtor={realtor} size={128} className="ring-4 ring-white/10" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">Your realtor</p>
                <h2 id="me-h" className="mt-2 text-3xl font-bold tracking-tight">{realtor.name}</h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-white/75">{realtor.bio ?? `${firstName} is an accredited realtor with ${firm.name}, helping buyers find verified properties with flexible payment plans.`}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={`${base}/contact`} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-950">Contact {firstName}</Link>
                  <Link href={`${base}/about`} className="rounded-full px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">More about me</Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {(realtor.testimonials?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="t-h">
          <SectionHeading id="t-h" eyebrow="Real buyers" title="What clients say" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {realtor.testimonials!.map((t, i) => (
              <Reveal key={i} delay={i * 90}>
                <figure className="h-full rounded-3xl bg-white p-7 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70">
                  <LuQuote className="text-3xl text-brand opacity-40" aria-hidden="true" />
                  <blockquote className="mt-3 text-lg leading-relaxed text-gray-800">{t.text}</blockquote>
                  <figcaption className="mt-5 text-sm font-semibold text-gray-950">{t.name}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {site.faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pt-20" aria-labelledby="faq-h">
          <SectionHeading id="faq-h" eyebrow="Good to know" title="Frequently asked questions" />
          <div className="mt-8 space-y-3">
            {site.faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70 open:ring-[var(--brand)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-950">
                  {f.q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition group-open:rotate-45 group-open:bg-brand group-open:text-brand-ink" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Mobile enquiry */}
      <section className="mx-auto max-w-3xl px-4 pt-16 md:hidden" aria-label="Enquiry form">
        <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-lift)] ring-1 ring-gray-200">
          <LeadForm firm={firmSlug} realtor={realtorSlug} realtorName={realtor.name} whatsapp={realtor.whatsapp} privacyHref={`${base}/privacy`} />
        </div>
      </section>
    </main>
  );
}
