"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, CheckCircle2, Circle, Coins, Copy, ExternalLink, Inbox, MousePointerClick, Percent, Scale, Share2, TrendingUp, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { api, qs, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CHANNEL_LABEL, formatDate, formatNaira, formatNairaShort, LEAD_STATUS_LABEL } from "@/lib/format";
import { Avatar, Bars, Button, Card, Empty, LinkButton, PageHeader, Select, Skeleton, Stat, Table, Td, useCopy } from "@/components/ui";

interface Funnel {
  totals: { visits: number; leads: number; bookings: number; attended: number; payments: number; paymentAmount: number; sales: number };
  conversion: { visitToLead: number; leadToInspection: number; inspectionToSale: number };
  series: { visits: { date: string; n: number }[]; leads: { date: string; n: number }[] };
}
interface FirmDash extends Funnel {
  byEstate: { id: string; name: string; leads: number; sales: number }[];
  byRealtor: { id: string | null; name: string; leads: number; sales: number; salesValue: number }[];
  byChannel: { channel: string; n: number }[];
  attributedRevenueShare: number;
  pipeline: Record<string, number>;
  realtors: { active: number; sharing: number; monthlyActiveRate: number };
  openConflicts: number;
}
interface RealtorDash extends Funnel {
  clientStatuses: Record<string, number>;
  commission: Record<string, number>;
  upcomingInspections: { _id: string; name: string; dateKey: string; time: string; estate?: string }[];
}

function periodRange(days: number) {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86_400_000);
  const k = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
  return { from: k(from), to: k(to) };
}

function PeriodSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-0 w-auto" aria-label="Period">
      <option value={7}>Last 7 days</option>
      <option value={30}>Last 30 days</option>
      <option value={90}>Last 90 days</option>
    </Select>
  );
}

function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const max = Math.max(1, steps[0]?.n ?? 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = steps[i - 1]?.n;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-gray-800">{s.label}</span>
              <span className="tabular-nums text-gray-900"><strong>{s.n.toLocaleString()}</strong>{prev && s.n <= prev ? <span className="ml-2 text-xs text-gray-500">{Math.round((s.n / prev) * 100)}%</span> : null}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, (s.n / max) * 100)}%` }} transition={{ delay: i * 0.08, type: "spring", stiffness: 140, damping: 22 }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DashSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
    </div>
  );
}

function Onboarding() {
  const { data, mutate } = useApi<{ steps: { key: string; label: string; done: boolean; href: string }[]; complete: boolean; dismissed: boolean }>("/firm/onboarding");
  if (!data || data.complete || data.dismissed) return null;
  const done = data.steps.filter((s) => s.done).length;
  return (
    <Card className="mb-6 bg-gradient-to-br from-emerald-50/80 to-white" title={<span className="flex items-center gap-3">Get set up <span className="h-1.5 w-28 overflow-hidden rounded-full bg-emerald-100"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${(done / data.steps.length) * 100}%` }} /></span><span className="text-xs font-medium text-gray-500">{done}/{data.steps.length}</span></span>} actions={<button className="text-xs text-gray-500 hover:underline" onClick={async () => { await api("/firm", { method: "PATCH", body: { onboarding: { dismissed: true } } }).catch(() => {}); void mutate(); }}>Dismiss</button>}>
      <ol className="grid gap-2 sm:grid-cols-4">
        {data.steps.map((s, i) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm shadow-sm ring-1 ring-gray-200 transition hover:ring-emerald-600">
              {s.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-gray-300" />}
              <span className={s.done ? "text-gray-500 line-through" : "font-medium text-gray-900"}>{i + 1}. {s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function FirmDashboard() {
  const [days, setDays] = useState(30);
  const { data } = useApi<FirmDash>(`/analytics/firm${qs(periodRange(days))}`);
  return (
    <>
      <PageHeader title="Dashboard" description="Sales activity across your realtor network" actions={<PeriodSelect value={days} onChange={setDays} />} />
      <Onboarding />
      {!data ? <DashSkeleton /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={<MousePointerClick />} color="sky" label="Link visits" value={data.totals.visits.toLocaleString()} sub={`${data.conversion.visitToLead}% became leads`} />
            <Stat icon={<Inbox />} label="Leads" value={data.totals.leads.toLocaleString()} sub={`${data.conversion.leadToInspection}% booked inspection`} />
            <Stat icon={<CalendarCheck />} color="violet" label="Inspections" value={data.totals.bookings} sub={`${data.totals.attended} attended`} />
            <Stat icon={<Wallet />} color="amber" label="Payments received" value={formatNairaShort(data.totals.paymentAmount)} sub={`${data.totals.sales} new sales`} />
            <Stat icon={<Percent />} label="Attributed sales" value={`${data.attributedRevenueShare}%`} sub="of new sales credited to a realtor" />
            <Stat icon={<Users />} color="sky" label="Active realtors" value={data.realtors.active} sub={`${data.realtors.monthlyActiveRate}% shared this period`} />
            <Stat icon={<Scale />} color="rose" label="Open conflicts" value={data.openConflicts} tone={data.openConflicts ? "warn" : undefined} sub={data.openConflicts ? <Link href="/app/conflicts" className="font-medium text-amber-700 hover:underline">Review now →</Link> : "None waiting"} />
            <Stat icon={<TrendingUp />} color="violet" label="Inspection → sale" value={`${data.conversion.inspectionToSale}%`} sub="of attended inspections bought" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Link visits per day" className="lg:col-span-2"><Bars data={data.series.visits} label="Visits" /></Card>
            <Card title="Sales funnel">
              <Funnel steps={[{ label: "Link visits", n: data.totals.visits }, { label: "Leads", n: data.totals.leads }, { label: "Inspections booked", n: data.totals.bookings }, { label: "Attended", n: data.totals.attended }, { label: "Sales", n: data.totals.sales }]} />
            </Card>
          </div>
          <Card title="New leads per day"><Bars data={data.series.leads} label="Leads" height={110} /></Card>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Top realtors" padded={false} className="lg:col-span-2" actions={<LinkButton href="/app/realtors?tab=performance" variant="ghost" size="sm">Leaderboard →</LinkButton>}>
              <Table head={["Realtor", "Leads", "Sales", "Sales value"]} empty={<Empty title="No leads in this period" />}>
                {data.byRealtor.map((r) => (
                  <tr key={r.id ?? "house"}>
                    <Td className="font-medium">{r.id ? <Link href={`/app/realtors/${r.id}`} className="flex items-center gap-2.5 hover:text-emerald-700"><Avatar name={r.name} size={28} />{r.name}</Link> : <span className="text-gray-500">House (no realtor)</span>}</Td>
                    <Td>{r.leads}</Td><Td>{r.sales}</Td><Td>{formatNaira(r.salesValue)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Visits by channel">
              {data.byChannel.length === 0 ? <p className="text-sm text-gray-500">No visits yet.</p> : (
                <ul className="space-y-2">
                  {data.byChannel.map((c) => {
                    const pct = Math.round((c.n / Math.max(1, data.totals.visits)) * 100);
                    return (
                      <li key={c.channel} className="text-sm">
                        <div className="flex justify-between"><span>{CHANNEL_LABEL[c.channel] ?? c.channel}</span><span className="text-gray-500">{c.n}</span></div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600" /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Interest by estate" padded={false}>
              <Table head={["Estate", "Leads", "Sales"]} empty={<Empty title="No estate interest yet" />}>
                {data.byEstate.map((e) => <tr key={e.id}><Td className="font-medium">{e.name}</Td><Td>{e.leads}</Td><Td>{e.sales}</Td></tr>)}
              </Table>
            </Card>
            <Card title="Pipeline (all leads)">
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(LEAD_STATUS_LABEL).filter(([k]) => k !== "merged").map(([k, label]) => (
                  <li key={k}><Link href={`/app/leads?status=${k}`} className="flex justify-between rounded-xl bg-gray-50 px-3 py-2.5 transition hover:bg-emerald-50 hover:text-emerald-900"><span>{label}</span><span className="font-semibold tabular-nums">{data.pipeline[k] ?? 0}</span></Link></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function RealtorDashboard() {
  const { session } = useSession();
  const copy = useCopy();
  const [days, setDays] = useState(30);
  const { data } = useApi<RealtorDash>(`/analytics/realtor${qs(periodRange(days))}`);
  const site = session.realtor!;
  return (
    <>
      <PageHeader title={`Hi ${session.user.name.split(" ")[0]} 👋`} description={`Realtor code ${site.code}`} actions={<PeriodSelect value={days} onChange={setDays} />} />
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-[var(--ink)] p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-white/15"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Your website is live</p>
            <a href={site.siteUrl} target="_blank" rel="noopener" className="mt-3 block truncate text-lg font-semibold hover:underline sm:text-xl">{site.siteUrl.replace(/^https?:\/\//, "")}</a>
            <p className="mt-1 text-sm text-white/60">Every link you share carries your code, so every lead is credited to you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="bg-white/10 text-white ring-white/20 hover:bg-white/20" onClick={() => copy(site.siteUrl, "Site link copied")}><Copy className="h-4 w-4" /> Copy link</Button>
            <a href={site.siteUrl} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[13px] font-medium ring-1 ring-inset ring-white/20 transition hover:bg-white/20"><ExternalLink className="h-4 w-4" /> Open</a>
            <LinkButton href="/app/share" size="sm" className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"><Share2 className="h-4 w-4" /> Share properties</LinkButton>
          </div>
        </div>
      </section>
      {!data ? <DashSkeleton /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat icon={<MousePointerClick />} color="sky" label="Link clicks" value={data.totals.visits} />
            <Stat icon={<Inbox />} label="Leads" value={data.totals.leads} sub={`${data.conversion.visitToLead}% of clicks`} />
            <Stat icon={<CalendarCheck />} color="violet" label="Inspections" value={data.totals.bookings} />
            <Stat icon={<TrendingUp />} label="Sales" value={data.totals.sales} />
            <Stat icon={<Coins />} color="amber" label="Commission earned" value={formatNairaShort((data.commission.earned ?? 0) + (data.commission.approved ?? 0) + (data.commission.paid ?? 0))} sub={`${formatNairaShort(data.commission.paid ?? 0)} paid out`} />
            <Stat icon={<Wallet />} color="gray" label="Commission pending" value={formatNairaShort(data.commission.pending ?? 0)} sub="Sales in progress" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="My clients" actions={<LinkButton href="/app/leads" variant="ghost" size="sm">All leads →</LinkButton>}>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(LEAD_STATUS_LABEL).filter(([k]) => k !== "merged").map(([k, label]) => (
                  <li key={k}><Link href={`/app/leads?status=${k}`} className="flex justify-between rounded-xl bg-gray-50 px-3 py-2.5 transition hover:bg-emerald-50 hover:text-emerald-900"><span>{label}</span><span className="font-semibold tabular-nums">{data.clientStatuses[k] ?? 0}</span></Link></li>
                ))}
              </ul>
            </Card>
            <Card title="Upcoming inspections">
              {data.upcomingInspections.length === 0 ? <p className="text-sm text-gray-500">No upcoming inspections. Share your links to get bookings.</p> : (
                <ul className="divide-y divide-gray-100">
                  {data.upcomingInspections.map((b) => (
                    <li key={b._id} className="flex justify-between py-2 text-sm"><span className="font-medium">{b.name}</span><span className="text-gray-600">{b.estate} · {formatDate(`${b.dateKey}T12:00:00+01:00`, { weekday: "short", day: "numeric", month: "short" })} {b.time}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card title="Clicks on your links"><Bars data={data.series.visits} label="Clicks" /></Card>
        </div>
      )}
    </>
  );
}

export default function DashboardHome() {
  const { session } = useSession();
  if (session.user.role === "realtor") return <RealtorDashboard />;
  if (!session.tenant) return null;
  return <FirmDashboard />;
}
