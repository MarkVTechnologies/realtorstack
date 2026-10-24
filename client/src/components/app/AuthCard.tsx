import Link from "next/link";

const POINTS = [
  "A branded property website for every realtor",
  "Every lead, inspection and sale credited automatically",
  "Commission statements everyone trusts",
];

export function AuthCard({ title, subtitle, children, brand, logo, firmName }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; brand?: string; logo?: string; firmName?: string }) {
  const color = brand ?? "#0f5132";
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col" style={{ background: `linear-gradient(150deg, ${color} 0%, #0b1f17 85%)` }}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-3 text-lg font-semibold">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-11 w-11 rounded-xl bg-white object-contain p-1" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl ring-1 ring-white/20" />
          )}
          {firmName ?? "RealtorStack"}
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Sell more. Argue less.</h2>
          <p className="mt-3 text-white/75">The sales infrastructure for Nigerian real estate networks.</p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs ring-1 ring-white/20">✓</span>{p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">RealtorStack · Mark V Technologies Limited</p>
      </section>

      {/* Form */}
      <section className="flex flex-col items-center justify-center bg-[var(--background)] px-4 py-10 sm:px-8">
        <Link href="/" className="mb-8 flex items-center gap-2 font-semibold text-gray-900 lg:hidden">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg font-bold text-white" style={{ background: color }}>{(firmName ?? "R").charAt(0)}</span>
          )}
          {firmName ?? "RealtorStack"}
        </Link>
        <div className="w-full max-w-[420px] animate-fade-up rounded-3xl bg-white p-7 shadow-[var(--shadow-lift)] ring-1 ring-gray-200/70 sm:p-9">
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-gray-600">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <p className="mt-8 text-xs text-gray-400 lg:hidden">RealtorStack · Mark V Technologies Limited</p>
      </section>
    </main>
  );
}
