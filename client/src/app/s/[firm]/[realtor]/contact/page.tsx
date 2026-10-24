import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/site-data";
import { siteBase, siteOrigin } from "@/lib/urls";
import { formatPhone } from "@/lib/format";
import { SiteSkeleton } from "@/components/site/parts";
import { LeadForm } from "@/components/site/LeadForm";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";
import { SiteTracker } from "@/components/site/SiteTracker";

type Params = Promise<{ firm: string; realtor: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) return {};
  const name = data.realtor.house ? data.firm.name : data.realtor.realtor.name;
  return { title: { absolute: `Contact ${name}` }, alternates: { canonical: `${siteOrigin(firm, realtor)}/contact` } };
}

export default function ContactPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Contact params={params} />
    </Suspense>
  );
}

async function Contact({ params }: { params: Params }) {
  const { firm, realtor } = await params;
  const data = await loadSite(firm, realtor);
  if (!data) notFound();
  const r = data.realtor.realtor;
  const base = siteBase(firm, realtor);
  const whatsapp = r.whatsapp ?? data.firm.contact?.whatsapp;
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-[1fr_1.3fr]">
      <SiteTracker firm={firm} realtor={realtor} />
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Contact {data.realtor.house ? "us" : r.name.split(" ")[0]}</h1>
        <p className="mt-2 text-gray-600">Ask about prices, payment plans, documents or inspections.</p>
        <div className="mt-6 space-y-3">
          {whatsapp && <WhatsAppButton firm={firm} realtor={realtor} whatsapp={whatsapp} realtorName={r.name} />}
          {r.phone && <a href={`tel:${r.phone}`} className="flex items-center justify-center rounded-xl border-2 border-brand px-5 py-3 font-semibold text-brand">Call {formatPhone(r.phone)}</a>}
        </div>
        {data.firm.contact?.address && (
          <div className="mt-8 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{data.firm.name} office</p>
            <p>{data.firm.contact.address}</p>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <LeadForm firm={firm} realtor={realtor} realtorName={r.name} whatsapp={whatsapp} privacyHref={`${base}/privacy`} heading="Send an enquiry" />
      </div>
    </main>
  );
}
