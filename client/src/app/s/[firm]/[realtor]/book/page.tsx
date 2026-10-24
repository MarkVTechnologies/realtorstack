import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/site-data";
import { siteBase, siteOrigin } from "@/lib/urls";
import { locationLine } from "@/lib/format";
import { SiteImage, SiteSkeleton } from "@/components/site/parts";
import { BookingWidget } from "@/components/site/BookingWidget";
import { SiteTracker } from "@/components/site/SiteTracker";

type Params = Promise<{ firm: string; realtor: string }>;
type Search = Promise<{ estate?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) return {};
  return { title: { absolute: `Book a free site inspection · ${data.firm.name}` }, alternates: { canonical: `${siteOrigin(firm, realtor)}/book` } };
}

export default function BookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Book params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Book({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ firm, realtor }, { estate }] = await Promise.all([params, searchParams]);
  const data = await loadSite(firm, realtor);
  if (!data) notFound();
  const base = siteBase(firm, realtor);
  const bookable = data.estates.filter((e) => e.status !== "sold_out");
  const chosen = bookable.find((e) => e.slug === estate) ?? (bookable.length === 1 ? bookable[0] : undefined);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <SiteTracker firm={firm} realtor={realtor} estate={chosen?.slug} />
      <h1 className="text-3xl font-bold text-gray-900">Book a free site inspection</h1>
      <p className="mt-2 text-gray-600">See the land for yourself. Choose an estate and a time that suits you.</p>

      <div className="scrollbar-none mt-6 flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Estates">
        {bookable.map((e) => (
          <Link key={e.id} role="listitem" href={`${base}/book?estate=${e.slug}`} aria-current={chosen?.id === e.id ? "true" : undefined}
            className={`flex w-60 shrink-0 items-center gap-3 rounded-xl border p-2 ${chosen?.id === e.id ? "border-brand bg-brand-soft" : "border-gray-200 bg-white"}`}>
            <SiteImage image={e.cover} alt={e.name} sizes="64px" className="h-14 w-16 shrink-0 rounded-lg" />
            <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{e.name}</span><span className="block truncate text-xs text-gray-600">{locationLine(e.location)}</span></span>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {chosen ? (
          <BookingWidget key={chosen.slug} firm={firm} realtor={realtor} estate={chosen.slug} estateName={chosen.name} privacyHref={`${base}/privacy`} />
        ) : (
          <p className="text-gray-700">Select an estate above to see available inspection dates.</p>
        )}
      </div>
    </main>
  );
}
