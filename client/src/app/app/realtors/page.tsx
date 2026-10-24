"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, Upload, UserPlus } from "lucide-react";
import { api, qs, useApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatNaira, formatPhone, timeAgo } from "@/lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea, useCopy, useToast } from "@/components/ui";

interface RealtorRow {
  id: string; name: string; phone?: string; email?: string; status: string; code?: string; siteUrl?: string; source?: string;
  lastShareAt?: string; lastLeadAt?: string; leads: number; clicks: number; commission: number; createdAt: string;
}
interface PerfRow { id: string; name: string; code?: string; shares: number; clicks: number; leads: number; bookings: number; sales: number; salesValue: number; inactive: boolean; lastShareAt: string | null }

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"single" | "csv">("single");
  const [result, setResult] = useState<{ inviteUrl?: string; imported?: number; failed?: number; results?: { row: number; name: string; ok: boolean; error?: string }[] } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState("");
  const copy = useCopy();
  const close = () => { setResult(null); setErr(null); setCsv(""); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Invite realtors" wide>
      <Tabs value={mode} onChange={(m) => { setMode(m); setResult(null); }} tabs={[{ value: "single", label: "One realtor" }, { value: "csv", label: "Bulk CSV" }]} />
      <div className="mt-4">
        {result?.inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Invite sent by email/SMS. You can also share this activation link directly on WhatsApp:</p>
            <div className="flex gap-2"><Input readOnly value={result.inviteUrl} className="mt-0" /><Button variant="secondary" onClick={() => copy(result.inviteUrl!)}><Copy className="h-4 w-4" /></Button></div>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setResult(null)}>Invite another</Button><Button onClick={close}>Done</Button></div>
          </div>
        ) : result?.results ? (
          <div className="space-y-3">
            <p className="text-sm"><strong>{result.imported}</strong> invited, <strong>{result.failed}</strong> failed.</p>
            <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
              {result.results.filter((r) => !r.ok).map((r) => <li key={r.row} className="px-3 py-2 text-red-700">Row {r.row} ({r.name || "no name"}): {r.error}</li>)}
            </ul>
            <div className="flex justify-end"><Button onClick={close}>Done</Button></div>
          </div>
        ) : mode === "single" ? (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true); setErr(null);
            try { setResult(await api("/realtors/invite", { body: { name: fd.get("name"), phone: fd.get("phone") || undefined, email: fd.get("email") || "" } })); onDone(); } catch (er) { setErr(er); } finally { setBusy(false); }
          }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name"><Input name="name" required minLength={2} /></Field>
              <Field label="Phone"><Input name="phone" type="tel" placeholder="0803 123 4567" /></Field>
              <Field label="Email"><Input name="email" type="email" /></Field>
            </div>
            <p className="text-xs text-gray-500">Phone or email is required. Their site is created now and goes live once they verify their phone.</p>
            <ErrorNote error={err} />
            <div className="flex justify-end"><Button type="submit" loading={busy}>Send invite</Button></div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Columns: <code className="rounded bg-gray-100 px-1">name, phone, email</code>. Up to 1,000 rows.</p>
            <input type="file" accept=".csv,text/csv" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
            <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,phone,email\nTobi Adewale,08061112222,tobi@example.com"} className="font-mono text-xs" />
            <ErrorNote error={err} />
            <div className="flex justify-end"><Button loading={busy} disabled={csv.length < 5} onClick={async () => { setBusy(true); setErr(null); try { setResult(await api("/realtors/import", { body: { csv } })); onDone(); } catch (er) { setErr(er); } finally { setBusy(false); } }}><Upload className="h-4 w-4" /> Import & invite</Button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Recruitment() {
  const { data, mutate } = useApi<{ registrationUrl: string | null; registration?: { enabled: boolean; requireApproval: boolean } }>("/firm");
  const copy = useCopy();
  const can = useCan();
  if (!data) return <Loading />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Recruitment link & QR code">
        <p className="text-sm text-gray-600">Share in your realtor WhatsApp groups, at trainings and recruitment campaigns. New recruits register themselves and wait for your approval.</p>
        {data.registrationUrl ? (
          <>
            <div className="mt-4 flex gap-2"><Input readOnly value={data.registrationUrl} className="mt-0" /><Button variant="secondary" onClick={() => copy(data.registrationUrl!)}><Copy className="h-4 w-4" /></Button></div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="rounded-xl border bg-white p-3"><QRCodeSVG value={data.registrationUrl} size={160} /></div>
              <a href={`/api/realtors/qr?format=png&download=1&text=${encodeURIComponent(data.registrationUrl)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"><Download className="h-4 w-4" /> Download QR (PNG)</a>
            </div>
          </>
        ) : <p className="mt-3 text-sm text-gray-500">No link yet.</p>}
        {can("realtors.manage") && <Button className="mt-4" size="sm" variant="ghost" onClick={async () => { if (window.confirm("Generate a new link? The old link will stop working.")) { await api("/firm/registration/rotate", { body: {} }); void mutate(); } }}>Generate new link</Button>}
      </Card>
      <Card title="How attribution works for realtors">
        <p className="text-sm text-gray-700"><strong>The realtor whose link the buyer first used gets credit</strong>, provided the buyer converts within the attribution window. A buyer&apos;s identity is their phone number.</p>
        <p className="mt-2 text-sm text-gray-600">Share this rule at signup and in trainings — it is shown on the registration page too. Configure it under Settings → Attribution.</p>
      </Card>
    </div>
  );
}

function Performance() {
  const [sort, setSort] = useState("leads");
  const { data } = useApi<PerfRow[]>(`/analytics/realtors${qs({ sort })}`);
  const inactive = data?.filter((r) => r.inactive) ?? [];
  return (
    <div className="space-y-6">
      <Card padded={false} title="Leaderboard · last 30 days" actions={<>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-0 w-auto" aria-label="Sort by"><option value="leads">By leads</option><option value="bookings">By inspections</option><option value="salesValue">By sales value</option><option value="clicks">By clicks</option></Select>
        <a href="/api/analytics/realtors?format=csv" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm"><Download className="h-4 w-4" /> CSV</a>
      </>}>
        {!data ? <Loading /> : (
          <Table head={["#", "Realtor", "Shares", "Clicks", "Leads", "Inspections", "Sales", "Value"]} empty={<Empty title="No active realtors yet" />}>
            {data.map((r, i) => (
              <tr key={r.id}>
                <Td className="text-gray-400">{i + 1}</Td>
                <Td><Link href={`/app/realtors/${r.id}`} className="font-medium hover:underline">{r.name}</Link> <span className="text-xs text-gray-400">{r.code}</span></Td>
                <Td>{r.shares}</Td><Td>{r.clicks}</Td><Td>{r.leads}</Td><Td>{r.bookings}</Td><Td>{r.sales}</Td><Td>{formatNaira(r.salesValue)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title={`Inactive realtors (no shares or leads in 30 days) · ${inactive.length}`}>
        {inactive.length === 0 ? <p className="text-sm text-gray-500">Everyone has been active. 🎉</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((r) => <li key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><Link href={`/app/realtors/${r.id}`} className="font-medium hover:underline">{r.name}</Link><span className="text-xs text-gray-500">last share {timeAgo(r.lastShareAt)}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function RealtorsPage() {
  const can = useCan();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const tab = (sp.get("tab") ?? "network") as "network" | "recruit" | "performance";
  const status = sp.get("status") ?? "";
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState(false);
  const { data, mutate } = useApi<RealtorRow[]>(`/realtors${qs({ status, q })}`);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); router.replace(`/app/realtors?${n}`); };

  async function approve(r: RealtorRow) {
    try { await api(`/realtors/${r.id}/status`, { method: "PATCH", body: { status: "active" } }); toast(`${r.name} approved — site is live`); void mutate(); } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <>
      <PageHeader title="Realtors" description="Your network, their sites and their results."
        actions={can("realtors.manage") && <Button onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" /> Invite realtors</Button>} />
      <Tabs value={tab} onChange={(t) => setParam("tab", t === "network" ? "" : t)} tabs={[{ value: "network", label: "Network" }, { value: "recruit", label: "Recruitment link" }, { value: "performance", label: "Performance" }]} />
      <div className="mt-4">
        {tab === "recruit" ? <Recruitment /> : tab === "performance" ? <Performance /> : (
          <Card padded={false}>
            <div className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="mt-0 min-w-[200px] flex-1" />
              <Select value={status} onChange={(e) => setParam("status", e.target.value)} className="mt-0 w-auto" aria-label="Status">
                <option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending approval</option><option value="invited">Invited</option><option value="suspended">Suspended</option><option value="exited">Exited</option>
              </Select>
              <a href={`/api/realtors?format=csv`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm"><Download className="h-4 w-4" /> CSV</a>
            </div>
            {!data ? <Loading /> : (
              <Table head={["Realtor", "Code", "Status", "Clicks", "Leads", "Commission", "Last share", ""]} empty={<Empty title="No realtors" description="Invite realtors or share your recruitment link." />}>
                {data.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <Td><Link href={`/app/realtors/${r.id}`} className="font-medium hover:underline">{r.name}</Link><p className="text-xs text-gray-500">{formatPhone(r.phone) || r.email}</p></Td>
                    <Td className="font-mono text-xs">{r.code}</Td>
                    <Td><div className="flex gap-1"><StatusBadge status={r.status} />{r.source === "registration_link" && <Badge>Self-registered</Badge>}</div></Td>
                    <Td>{r.clicks}</Td><Td>{r.leads}</Td><Td>{formatNaira(r.commission)}</Td>
                    <Td className="text-gray-500">{timeAgo(r.lastShareAt)}</Td>
                    <Td className="text-right">{r.status === "pending" && can("realtors.manage") && <Button size="sm" onClick={() => approve(r)}>Approve</Button>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>
      <InviteModal open={inviting} onClose={() => setInviting(false)} onDone={() => void mutate()} />
    </>
  );
}
