import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrivacy } from "@/lib/site-data";
import { SiteSkeleton } from "@/components/site/parts";

type Params = Promise<{ firm: string; realtor: string }>;

export const metadata: Metadata = { title: "Privacy notice", robots: { index: false } };

export default function PrivacyPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Privacy params={params} />
    </Suspense>
  );
}

/** NDPA 2023: privacy notice per firm (firm = controller, RealtorStack = processor). */
async function Privacy({ params }: { params: Params }) {
  const { firm } = await params;
  const data = await getPrivacy(firm);
  if (!data) notFound();
  const name = data.firm.name;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-gray-800">
      <h1 className="text-3xl font-bold text-gray-900">Privacy notice</h1>
      <p className="mt-2 text-sm text-gray-600">{name} · Nigeria Data Protection Act 2023</p>
      {data.privacyPolicy ? (
        <div className="mt-6 whitespace-pre-line leading-relaxed">{data.privacyPolicy}</div>
      ) : (
        <div className="mt-6 space-y-4 leading-relaxed">
          <p>{name} (&quot;we&quot;) is the data controller for information you submit on this website. RealtorStack, operated by Mark V Technologies Limited, processes it on our behalf.</p>
          <p><strong>What we collect:</strong> your name, phone number, email (optional), the properties you are interested in and your messages, plus technical data about how you reached this page (for example, which realtor&apos;s link you used).</p>
          <p><strong>Why:</strong> to respond to your enquiry, arrange inspections, process purchases and credit the realtor who assisted you.</p>
          <p><strong>Your rights:</strong> you can ask for a copy of your data, correction, or deletion at any time{data.firm.contact?.email ? ` by emailing ${data.firm.contact.email}` : " by contacting us"}.</p>
          <p>We do not sell your personal data. Payment card details are handled only by licensed payment providers and are never stored by us.</p>
        </div>
      )}
    </main>
  );
}
