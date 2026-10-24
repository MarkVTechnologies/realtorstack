import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/site-data";
import { siteBase, siteOrigin } from "@/lib/urls";
import { EstateCard, SectionHeading, SiteSkeleton } from "@/components/site/parts";
import { Reveal } from "@/components/site/Reveal";
import { SiteTracker } from "@/components/site/SiteTracker";

type Params = Promise<{ firm: string; realtor: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) return {};
  return {
    title: { absolute: `Properties for sale · ${data.firm.name}` },
    description: `Browse ${data.estates.length} estates by ${data.firm.name}: prices, payment plans and title documents.`,
    alternates: { canonical: `${siteOrigin(firm, realtor)}/estates` },
  };
}

export default function EstatesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Estates params={params} />
    </Suspense>
  );
}

async function Estates({ params }: { params: Params }) {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) notFound();
  const base = siteBase(firm, realtor);
  const groups = [
    { title: "Now selling", items: data.estates.filter((e) => e.status === "selling") },
    { title: "Coming soon", items: data.estates.filter((e) => e.status === "coming_soon") },
    { title: "Sold out", items: data.estates.filter((e) => e.status === "sold_out") },
  ].filter((g) => g.items.length);
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <SiteTracker firm={firm} realtor={realtor} />
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">{data.firm.name}</p>
      <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-gray-950">Properties for sale</h1>
      <p className="mt-3 max-w-2xl text-gray-600">Live prices and payment plans, updated directly by {data.firm.name}. Tap any estate for plans, documents and free inspection dates.</p>
      {groups.map((g) => (
        <section key={g.title} className="mt-10" aria-label={g.title}>
          <SectionHeading title={g.title} className="[&_h2]:text-xl" />
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((e, i) => (g === groups[0] && i < 3 ? <EstateCard key={e.id} estate={e} href={`${base}/estates/${e.slug}`} priority={i === 0} /> : <Reveal key={e.id} delay={(i % 3) * 80}><EstateCard estate={e} href={`${base}/estates/${e.slug}`} /></Reveal>))}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="mt-8 text-gray-600">No properties are listed yet.</p>}
    </main>
  );
}
