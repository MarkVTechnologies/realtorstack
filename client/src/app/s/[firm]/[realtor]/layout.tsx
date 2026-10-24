import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/site-data";
import { siteBase, siteOrigin } from "@/lib/urls";
import { SiteFooter, SiteHeader, SiteSkeleton, UnavailablePage, brandStyle } from "@/components/site/parts";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";

/**
 * Realtor site shell (RS-01..RS-03): firm controls theme, colours and logo; realtor details
 * come from their profile. Params are awaited inside Suspense so unknown realtor/firm pairs get
 * the App Shell instantly and are cached after the first visit (ISR with Cache Components).
 */
export default function SiteLayout({ children, params }: LayoutProps<"/s/[firm]/[realtor]">) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children, params }: { children: React.ReactNode; params: Promise<{ firm: string; realtor: string }> }) {
  const { firm: firmSlug, realtor: realtorSlug } = await params;
  const data = await loadSite(firmSlug, realtorSlug);
  if (!data) notFound();
  const { firm, realtor } = data;
  const base = siteBase(firmSlug, realtorSlug);
  const style = brandStyle(firm);

  if (firm.status !== "active" || !realtor.active) {
    return (
      <div style={style} className="flex min-h-screen flex-col bg-[#fafaf8]">
        <UnavailablePage firm={firm} reason={firm.status !== "active" ? "paused" : "realtor"} mainHref={siteOrigin(firmSlug, "main")} />
      </div>
    );
  }

  const whatsapp = realtor.realtor.whatsapp ?? firm.contact?.whatsapp;
  return (
    <div style={style} className="flex min-h-screen flex-col bg-[#fafaf8]">
      <noscript><style>{".reveal{opacity:1;transform:none}"}</style></noscript>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <SiteHeader firm={firm} realtor={realtor.realtor} base={base} house={realtor.house} />
      <div id="main" className="flex-1">{children}</div>
      <SiteFooter firm={firm} realtor={realtor.realtor} base={base} house={realtor.house} />
      {whatsapp && <WhatsAppButton variant="floating" firm={firmSlug} realtor={realtorSlug} whatsapp={whatsapp} realtorName={realtor.realtor.name} />}
    </div>
  );
}
