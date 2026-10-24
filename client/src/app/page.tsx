import Link from "next/link";
import type { Metadata } from "next";
import { FaWhatsapp } from "react-icons/fa";
import { LuArrowRight, LuBadgeCheck, LuCalendarCheck, LuChartColumn, LuCoins, LuGauge, LuGlobe, LuScale, LuShare2, LuShieldCheck } from "react-icons/lu";
import { Reveal } from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: { absolute: "RealtorStack — sales sites, lead attribution & commissions for Nigerian real estate" },
};

const features = [
  { icon: LuGlobe, title: "A sales site for every realtor", text: "Invite your network and every realtor instantly gets a branded, mobile-first site with all your estates, prices and payment plans. Zero data entry." },
  { icon: LuScale, title: "Attribution everyone trusts", text: "First-touch attribution on every link, enquiry, WhatsApp chat and inspection — with the evidence trail, a conflict queue and audited overrides." },
  { icon: LuShare2, title: "Built for WhatsApp", text: "Short links with rich previews, one-tap share to Status, pre-written captions and QR codes for flyers and site signage." },
  { icon: LuCalendarCheck, title: "Inspections on autopilot", text: "Buyers book from the realtor's site. You see every booking per day and estate — and who brought them." },
  { icon: LuCoins, title: "Commission statements", text: "Rules per estate or plot type, Pending → Earned → Approved → Paid, with monthly PDF and Excel statements." },
  { icon: LuGauge, title: "Fast on 3G", text: "Cached pages and compressed images, so prospects see prices and plans in seconds on a mid-range Android." },
];

const steps = [
  ["Publish estates once", "Add estates, plot types, prices, installment plans and inspection days."],
  ["Invite your realtors", "By phone, CSV or a recruitment link. They verify with OTP and their site is live."],
  ["Realtors share links", "Every link carries their code, so every lead is credited automatically."],
  ["Track to the naira", "See visits, leads, inspections and payments per realtor — and settle commissions without disputes."],
];

/** Static product preview: a realtor's property page next to the firm's attribution view. */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="absolute -inset-10 -z-10 rounded-full bg-emerald-500/20 blur-3xl" />
      {/* Phone: realtor site */}
      <div className="relative z-10 mx-auto w-[260px] rotate-[-3deg] overflow-hidden rounded-[2.2rem] border-[7px] border-gray-900 bg-white shadow-2xl lg:mx-0">
        <div className="h-36 bg-gradient-to-br from-emerald-700 via-emerald-600 to-amber-400 p-4">
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase text-white">Now selling</span>
        </div>
        <div className="space-y-2 p-4">
          <p className="text-base font-bold text-gray-950">Oak Gardens</p>
          <p className="text-[11px] text-gray-500">Eleko, Ibeju-Lekki, Lagos</p>
          <div className="flex gap-1"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">C of O</span><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">Survey</span></div>
          <div className="rounded-xl bg-emerald-900 p-3 text-white"><p className="text-[9px] uppercase text-white/70">From</p><p className="text-lg font-bold">₦6,500,000</p></div>
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2 text-[11px] font-semibold text-white"><FaWhatsapp /> Chat with Tobi</div>
        </div>
      </div>
      {/* Card: attribution */}
      <div className="absolute -bottom-8 right-0 z-20 w-[270px] rotate-[2deg] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 sm:right-6 lg:-right-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">New lead · attributed</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">FL</span>
          <div><p className="text-sm font-semibold text-gray-950">Funmi Lawal</p><p className="text-[11px] text-gray-500">via Tobi&apos;s WhatsApp link</p></div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-[11px]"><span className="font-semibold text-emerald-800">First touch · TOBI-001</span><LuBadgeCheck className="text-emerald-600" /></div>
      </div>
      <div className="absolute -top-4 right-4 z-20 hidden rotate-[4deg] rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-black/5 sm:block lg:right-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Commission earned</p>
        <p className="text-lg font-bold text-gray-950">₦363,000</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf8]">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-lg ring-1 ring-white/20" />
            RealtorStack
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <a href="#how" className="hidden rounded-full px-3.5 py-2 text-white/75 hover:text-white sm:inline">How it works</a>
            <Link href="/s/oakwood/tobi-adewale" className="hidden rounded-full px-3.5 py-2 text-white/75 hover:text-white sm:inline">Demo site</Link>
            <Link href="/login" className="rounded-full bg-white px-4 py-2 font-semibold text-gray-950 transition hover:bg-gray-100">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-[#0b1f17] pb-24 pt-32 text-white sm:pt-40">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_80%_10%,rgb(16_185_129/0.28),transparent),radial-gradient(40%_40%_at_10%_90%,rgb(201_162_39/0.18),transparent)]" />
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-white/15"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> For developers & realty firms in Nigeria</p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">The sales infrastructure for real estate networks.</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">Every realtor gets a ready-to-share sales site in minutes. Every naira of sales is traced back to the realtor who earned it.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="mailto:hello@markv.ng?subject=RealtorStack%20pilot" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 font-semibold text-emerald-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400">Join the pilot <LuArrowRight /></a>
                <Link href="/s/oakwood/tobi-adewale" className="rounded-full px-6 py-3.5 font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10">See a realtor site</Link>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65">
                <li className="flex items-center gap-1.5"><LuShieldCheck className="text-emerald-300" /> NDPA-compliant</li>
                <li className="flex items-center gap-1.5"><LuChartColumn className="text-emerald-300" /> Live sales dashboards</li>
                <li className="flex items-center gap-1.5"><FaWhatsapp className="text-emerald-300" /> WhatsApp-first</li>
              </ul>
            </div>
            <div className="animate-fade-up [animation-delay:150ms]"><ProductPreview /></div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Why firms switch</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">No more &ldquo;who brought this client?&rdquo;</h2>
            <p className="mt-3 max-w-2xl text-lg text-gray-600">Replace WhatsApp screenshots and spreadsheets with one place to publish estates, distribute links and settle commissions.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="h-full rounded-3xl bg-white p-7 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-emerald-700 ring-1 ring-emerald-600/10"><f.icon /></span>
                  <h3 className="mt-5 text-lg font-bold text-gray-950">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="bg-white py-24">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">How it works</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Live in a day, not a quarter</h2>
            </Reveal>
            <ol className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 lg:block" aria-hidden="true" />
              {steps.map(([t, d], i) => (
                <Reveal as="li" key={t} delay={i * 90} className="relative">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b1f17] text-base font-bold text-white shadow-lg ring-4 ring-white">{i + 1}</span>
                  <h3 className="mt-5 font-bold text-gray-950">{t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{d}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-24 text-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">The attribution rule, in one sentence</p>
            <blockquote className="mt-5 text-2xl font-semibold leading-snug tracking-tight text-gray-950 sm:text-3xl">&ldquo;The realtor whose link the buyer first used gets credit, provided the buyer converts within the attribution window.&rdquo;</blockquote>
            <p className="mt-5 text-gray-500">Configurable per firm. Every decision stored with its evidence. Every override audit-logged.</p>
          </Reveal>
        </section>

        <section className="px-4 pb-24">
          <Reveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#0b1f17] px-8 py-14 text-center text-white sm:px-16">
              <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
              <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Run a pilot with your realtor network</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-white/70">8–12 weeks, 1–3 estates, at least 30 realtors. Discounted, and credited against your first year if you continue.</p>
              <a href="mailto:hello@markv.ng?subject=RealtorStack%20pilot" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 font-semibold text-emerald-950 transition hover:bg-emerald-400">Talk to Mark V <LuArrowRight /></a>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">© 2026 Mark V Technologies Limited · RealtorStack</footer>
    </div>
  );
}
