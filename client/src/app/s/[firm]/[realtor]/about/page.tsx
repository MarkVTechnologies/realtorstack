import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/site-data";
import { siteBase, siteOrigin } from "@/lib/urls";
import { formatPhone } from "@/lib/format";
import { SiteSkeleton } from "@/components/site/parts";
import { SiteTracker } from "@/components/site/SiteTracker";

type Params = Promise<{ firm: string; realtor: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) return {};
  const name = data.realtor.house ? data.firm.name : data.realtor.realtor.name;
  return { title: { absolute: `About ${name}` }, description: data.realtor.realtor.bio ?? `About ${name}`, alternates: { canonical: `${siteOrigin(firm, realtor)}/about` } };
}

export default function AboutPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <About params={params} />
    </Suspense>
  );
}

async function About({ params }: { params: Params }) {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) notFound();
  const r = data.realtor.realtor;
  const base = siteBase(firm, realtor);
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <SiteTracker firm={firm} realtor={realtor} />
      <div className="flex flex-col items-start gap-6 sm:flex-row">
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photoUrl} alt={r.name} width={160} height={160} className="h-40 w-40 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-40 w-40 items-center justify-center rounded-2xl bg-brand text-5xl font-bold text-brand-ink">{r.name.charAt(0)}</span>
        )}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{data.realtor.house ? `About ${data.firm.name}` : r.name}</h1>
          {!data.realtor.house && <p className="mt-1 text-gray-600">Realtor with {data.firm.name}{r.code ? ` · Code ${r.code}` : ""}</p>}
          {r.areasServed && r.areasServed.length > 0 && <p className="mt-2 text-sm text-gray-700">Areas: {r.areasServed.join(", ")}</p>}
          {r.phone && <p className="mt-2"><a href={`tel:${r.phone}`} className="font-semibold text-brand">{formatPhone(r.phone)}</a></p>}
        </div>
      </div>
      <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-gray-800">
        {r.bio ?? (data.realtor.house ? data.firm.site.heroSubtitle : `${r.name} is an accredited realtor with ${data.firm.name}, helping buyers find verified properties with flexible payment plans.`)}
      </div>
      <section className="mt-10 rounded-2xl bg-brand-soft p-6">
        <h2 className="text-xl font-semibold text-gray-900">About {data.firm.name}</h2>
        <p className="mt-2 text-gray-800">{data.firm.site.heroSubtitle}</p>
        {data.firm.cacNumber && <p className="mt-2 text-sm text-gray-700">Registered with CAC: {data.firm.cacNumber}</p>}
        <Link href={`${base}/estates`} className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-ink">See properties</Link>
      </section>
    </main>
  );
}
