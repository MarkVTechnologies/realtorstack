import Link from "next/link";
import type { IconType } from "react-icons";
import {
  LuArrowRight, LuBadgeCheck, LuBus, LuCamera, LuCar, LuDroplets, LuDumbbell, LuFence, LuLampFloor, LuMapPin, LuPhone, LuRoute, LuShieldCheck,
  LuShoppingBag, LuSparkles, LuSun, LuTrees, LuWaves, LuZap, LuBaby, LuSchool, LuWifi,
} from "react-icons/lu";
import type { EstateSummary, MediaImage, PublicFirm, PublicProduct, PublicRealtor } from "@/lib/site-data";
import { formatDate, formatNaira, formatNairaShort, formatPhone, locationLine } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ReportLink } from "./ReportLink";

/** White or near-black text depending on brand colour luminance (WCAG contrast). */
export function inkFor(hex = "#0f5132") {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}

export function brandStyle(firm: PublicFirm): React.CSSProperties {
  const primary = firm.brand?.primaryColor ?? "#0f5132";
  return { ["--brand" as string]: primary, ["--brand-ink" as string]: inkFor(primary), ["--accent" as string]: firm.brand?.accentColor ?? "#c9a227" };
}

/** Responsive WebP image from the media pipeline; lazy by default (NFR performance budget). */
export function SiteImage({ image, alt, sizes = "100vw", priority = false, className = "" }: { image?: MediaImage | null; alt: string; sizes?: string; priority?: boolean; className?: string }) {
  if (!image) return <div className={cn("bg-gradient-to-br from-[var(--brand)] to-[var(--accent)]", className)} role="img" aria-label={alt} />;
  const v = image.variants ?? {};
  const srcSet = [v.sm && `${v.sm} 480w`, v.md && `${v.md} 960w`, v.lg && `${v.lg} 1600w`].filter(Boolean).join(", ");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images are pre-optimised WebP from our media pipeline
    <img src={v.md ?? image.url} srcSet={srcSet || undefined} sizes={sizes} alt={image.alt || alt} width={image.width ?? 1600} height={image.height ?? 1000}
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className={cn("object-cover", className)} />
  );
}

export function RealtorPhoto({ realtor, size = 48, className }: { realtor: Pick<PublicRealtor, "name" | "photoUrl">; size?: number; className?: string }) {
  if (realtor.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={realtor.photoUrl} alt={realtor.name} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-brand-ink", className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>{realtor.name.charAt(0)}</span>;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  selling: { label: "Now selling", cls: "bg-emerald-500 text-white" },
  sold_out: { label: "Sold out", cls: "bg-gray-800 text-white" },
  coming_soon: { label: "Coming soon", cls: "bg-amber-400 text-gray-900" },
};

export function EstateStatus({ status, className }: { status: string; className?: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.selling;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide shadow-sm", s.cls, className)}>{s.label}</span>;
}

export function EstateCard({ estate, href, priority }: { estate: EstateSummary; href: string; priority?: boolean }) {
  return (
    <Link href={href} prefetch={true} className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-soft)] ring-1 ring-gray-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[4/3] overflow-hidden">
        <SiteImage image={estate.cover} alt={estate.name} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={priority} className="h-full w-full transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          <EstateStatus status={estate.status} />
          {estate.hasPromo && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-900 shadow-sm"><LuSparkles /> Promo</span>}
        </div>
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-white">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/75">From</p>
            <p className="text-2xl font-bold leading-none tracking-tight">{formatNairaShort(estate.fromPrice)}</p>
          </div>
          {estate.minDeposit != null && <p className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">Deposit {formatNairaShort(estate.minDeposit)}</p>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold tracking-tight text-gray-950">{estate.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><LuMapPin className="shrink-0 text-brand" />{locationLine(estate.location)}</p>
        {estate.documents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {estate.documents.slice(0, 3).map((d) => <span key={d} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong"><LuShieldCheck /> {d}</span>)}
          </div>
        )}
        <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-brand transition group-hover:gap-2">View prices & plans <LuArrowRight /></span>
      </div>
    </Link>
  );
}

/** Compact full price list (used where the interactive explorer is too much). */
export function PriceTable({ products }: { products: PublicProduct[] }) {
  if (!products.length) return <p className="text-gray-600">Prices coming soon — send an enquiry to be first to know.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-gray-200">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">All prices and payment plans</caption>
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
          <tr><th className="px-4 py-3 font-semibold">Option</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Deposit</th><th className="px-4 py-3 font-semibold">Monthly</th><th className="px-4 py-3 font-semibold">Total</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.flatMap((p) => [
            <tr key={`${p.id}-o`}>
              <td className="px-4 py-3 font-semibold text-gray-900">{p.name}{p.status === "sold_out" && <span className="ml-2 text-xs font-medium text-gray-500">Sold out</span>}</td>
              <td className="px-4 py-3">Outright{p.promo && <span className="ml-1 text-xs font-semibold text-amber-700">({p.promo.label ?? "promo"}{p.promo.endsAt ? ` to ${formatDate(p.promo.endsAt, { day: "numeric", month: "short" })}` : ""})</span>}</td>
              <td className="px-4 py-3">—</td><td className="px-4 py-3">—</td>
              <td className="px-4 py-3 font-semibold">{formatNaira(p.price)}{p.promo && <span className="ml-1.5 text-xs font-normal text-gray-400 line-through">{formatNaira(p.outrightPrice)}</span>}</td>
            </tr>,
            ...p.plans.map((pl) => (
              <tr key={`${p.id}-${pl.name}`}>
                <td className="px-4 py-3 text-gray-500">{p.name}</td><td className="px-4 py-3">{pl.name}</td><td className="px-4 py-3">{formatNaira(pl.depositAmount)}</td>
                <td className="px-4 py-3">{formatNaira(pl.monthlyAmount)} × {pl.tenorMonths}</td><td className="px-4 py-3 font-semibold">{formatNaira(pl.totalPrice)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

const AMENITY_ICONS: [RegExp, IconType][] = [
  [/fence|gate|gated/i, LuFence], [/secur|guard|cctv/i, LuShieldCheck], [/road|tar|access/i, LuRoute], [/electric|power|light/i, LuZap],
  [/solar|street/i, LuSun], [/water|borehole|drain/i, LuDroplets], [/pool|swim/i, LuWaves], [/gym|fitness/i, LuDumbbell], [/park|green|garden|recreat/i, LuTrees],
  [/mall|shop|market/i, LuShoppingBag], [/school/i, LuSchool], [/child|play|kid/i, LuBaby], [/park(ing)?\b|car/i, LuCar], [/wifi|internet|fibre/i, LuWifi],
  [/bus|transport/i, LuBus], [/camera/i, LuCamera], [/lamp/i, LuLampFloor],
];
export function amenityIcon(label: string): IconType {
  return AMENITY_ICONS.find(([re]) => re.test(label))?.[1] ?? LuBadgeCheck;
}

export function SectionHeading({ eyebrow, title, action, id, className }: { eyebrow?: string; title: string; action?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>}
        <h2 id={id} className="mt-1.5 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function SiteHeader({ firm, realtor, base, house }: { firm: PublicFirm; realtor: PublicRealtor; base: string; house: boolean }) {
  const nav = [
    { href: `${base}/estates`, label: "Properties" },
    { href: `${base}/about`, label: house ? "About us" : "About me" },
    { href: `${base}/contact`, label: "Contact" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href={base || "/"} className="flex min-w-0 items-center gap-3">
          {house || !realtor.photoUrl ? (
            firm.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firm.logoUrl} alt={`${firm.name} logo`} width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-ink">{firm.name.charAt(0)}</span>
            )
          ) : (
            <RealtorPhoto realtor={realtor} size={40} className="ring-2 ring-white shadow" />
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-bold tracking-tight text-gray-950">{house ? firm.name : realtor.name}</span>
            <span className="block truncate text-xs text-gray-500">{house ? "Official sales site" : `Realtor · ${firm.name}`}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium text-gray-700 md:flex">
          {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 transition hover:bg-gray-100 hover:text-gray-950">{n.label}</Link>)}
        </nav>
        <Link href={`${base}/book`} className="shrink-0 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm transition hover:brightness-110">Book inspection</Link>
      </div>
      <nav aria-label="Main mobile" className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-2 text-sm font-medium text-gray-700 md:hidden">
        {nav.map((n) => <Link key={n.href} href={n.href} className="shrink-0 rounded-full bg-gray-100 px-3.5 py-1.5">{n.label}</Link>)}
      </nav>
    </header>
  );
}

export function SiteFooter({ firm, realtor, base, house }: { firm: PublicFirm; realtor: PublicRealtor; base: string; house: boolean }) {
  return (
    <footer className="mt-20 bg-gray-950 text-gray-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="text-lg font-bold text-white">{firm.name}</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed">{firm.site.heroSubtitle ?? "Verified titles, transparent prices and flexible payment plans."}</p>
          {firm.cacNumber && <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-gray-300 ring-1 ring-white/10"><LuBadgeCheck className="text-emerald-400" /> CAC registered · {firm.cacNumber}</p>}
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">{house ? "Contact" : realtor.name}</p>
          {!house && realtor.code && <p>Realtor code {realtor.code}</p>}
          {(realtor.phone ?? firm.contact?.phone) && <p><a href={`tel:${realtor.phone ?? firm.contact?.phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><LuPhone /> {formatPhone(realtor.phone ?? firm.contact?.phone)}</a></p>}
          {firm.contact?.address && <p className="flex gap-1.5"><LuMapPin className="mt-0.5 shrink-0" />{firm.contact.address}</p>}
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">Explore</p>
          <p><Link href={`${base}/estates`} className="hover:text-white">All properties</Link></p>
          <p><Link href={`${base}/book`} className="hover:text-white">Book an inspection</Link></p>
          <p><Link href={`${base}/privacy`} className="hover:text-white">Privacy notice</Link></p>
          <p><ReportLink firm={firm.slug} /></p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-gray-500">
        Powered by <a href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/`} className="font-semibold text-gray-300 hover:text-white">RealtorStack</a> · Sales sites for real estate networks
      </div>
    </footer>
  );
}

export function SiteSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-2/3 rounded-xl" />
      <div className="skeleton mt-4 h-4 w-1/2 rounded-lg" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[4/5] rounded-3xl" />)}
      </div>
    </div>
  );
}

export function UnavailablePage({ firm, mainHref, reason }: { firm: PublicFirm; mainHref: string; reason: "realtor" | "paused" }) {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-3xl text-brand"><LuShieldCheck /></span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-950">{reason === "paused" ? "This site is temporarily unavailable" : `This realtor is no longer listing with ${firm.name}`}</h1>
      <p className="mt-3 text-gray-600">{reason === "paused" ? "Please check back soon." : `You can still view all ${firm.name} properties and speak to our sales team.`}</p>
      {reason === "realtor" && <Link href={mainHref} className="mt-8 rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink shadow">View {firm.name} properties</Link>}
    </main>
  );
}
