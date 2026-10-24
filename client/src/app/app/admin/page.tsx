"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { api, qs, useApi } from "@/lib/api";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs, Td, Textarea, useCopy, useToast } from "@/components/ui";

interface TenantRow {
  id: string; name: string; slug: string; plan: string; status: string; cacNumber?: string; createdAt: string; siteUrl: string;
  activeRealtors: number; estates: number; leads30: number;
  billing?: { status?: string; seatLimit?: number; monthlyFee?: number; notes?: string };
}
interface Report { _id: string; url: string; reason: string; contact?: string; status: string; createdAt: string; tenant: { name: string; slug: string } | null }
interface Message { _id: string; channel: string; to: string; subject?: string; status: string; error?: string; createdAt: string }

const PLANS = ["pilot", "starter", "growth", "enterprise", "solo_free", "solo_pro"];

function TenantModal({ tenant, onClose, onSaved }: { tenant: TenantRow; onClose: () => void; onSaved: () => void }) {
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal open onClose={onClose} title={tenant.name}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          await api(`/admin/tenants/${tenant.id}`, { method: "PATCH", body: {
            plan: fd.get("plan"), status: fd.get("status"), suspendedReason: (fd.get("reason") as string) || undefined,
            billing: { status: fd.get("billingStatus"), seatLimit: Number(fd.get("seatLimit")), monthlyFee: Number(fd.get("monthlyFee")), notes: fd.get("notes") },
          } });
          onSaved(); onClose();
        } catch (er) { setErr(er); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan"><Select name="plan" defaultValue={tenant.plan}>{PLANS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Workspace status" hint="Suspended/paused sites show a paused page; data is kept"><Select name="status" defaultValue={tenant.status}><option value="active">Active</option><option value="paused">Paused (billing)</option><option value="suspended">Suspended (abuse)</option></Select></Field>
          <Field label="Billing status"><Select name="billingStatus" defaultValue={tenant.billing?.status ?? "pilot"}><option value="pilot">Pilot</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option><option value="overdue">Overdue</option></Select></Field>
          <Field label="Seat limit (active realtors)"><Input name="seatLimit" type="number" min={0} defaultValue={tenant.billing?.seatLimit ?? 25} /></Field>
          <Field label="Monthly fee (₦)"><Input name="monthlyFee" type="number" min={0} defaultValue={tenant.billing?.monthlyFee ?? 0} /></Field>
          <Field label="Suspension reason"><Input name="reason" placeholder="Required when suspending" /></Field>
        </div>
        <Field label="Billing notes"><Textarea name="notes" rows={2} defaultValue={tenant.billing?.notes} /></Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
      </form>
    </Modal>
  );
}

/** §8.14 Platform super-admin: tenants, plans, usage, billing status, abuse control. */
export default function AdminPage() {
  const toast = useToast();
  const copy = useCopy();
  const [tab, setTab] = useState<"tenants" | "reports" | "messages">("tenants");
  const [q, setQ] = useState("");
  const { data: overview } = useApi<{ tenants: number; activeTenants: number; realtors: number; leads30: number; failedMessages: number; openReports: number }>("/admin/overview");
  const { data: tenants, mutate } = useApi<TenantRow[]>(`/admin/tenants${qs({ q })}`);
  const { data: reports, mutate: mutateReports } = useApi<Report[]>(tab === "reports" ? "/admin/reports" : null);
  const { data: messages } = useApi<Message[]>(tab === "messages" ? "/admin/messages" : null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ slug: string; ownerInviteUrl: string } | null>(null);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [err, setErr] = useState<unknown>(null);

  return (
    <>
      <PageHeader title="Platform admin" description="Mark V operations" actions={<Button onClick={() => { setCreated(null); setErr(null); setCreating(true); }}>New firm workspace</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Firms" value={overview?.tenants ?? "…"} sub={`${overview?.activeTenants ?? 0} active`} />
        <Stat label="Active realtors" value={overview?.realtors ?? "…"} />
        <Stat label="Leads (30d)" value={overview?.leads30 ?? "…"} />
        <Stat label="Failed messages (30d)" value={overview?.failedMessages ?? "…"} tone={overview?.failedMessages ? "warn" : undefined} />
        <Stat label="Open abuse reports" value={overview?.openReports ?? "…"} tone={overview?.openReports ? "warn" : undefined} />
      </div>
      <div className="mt-6"><Tabs value={tab} onChange={setTab} tabs={[{ value: "tenants", label: "Firms" }, { value: "reports", label: "Abuse reports" }, { value: "messages", label: "Message log" }]} /></div>
      <div className="mt-4">
        {tab === "tenants" && (
          <Card padded={false}>
            <div className="border-b border-gray-100 p-3"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search firms" className="mt-0 max-w-sm" /></div>
            {!tenants ? <Loading /> : (
              <Table head={["Firm", "Plan", "Status", "Realtors", "Estates", "Leads 30d", "Billing", ""]} empty={<Empty title="No firms yet" />}>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <Td><a href={t.siteUrl} target="_blank" rel="noopener" className="font-medium hover:underline">{t.name}</a><p className="text-xs text-gray-500">{t.slug} · since {formatDate(t.createdAt)}</p></Td>
                    <Td className="capitalize">{t.plan.replace("_", " ")}</Td>
                    <Td><StatusBadge status={t.status} /></Td>
                    <Td>{t.activeRealtors}{t.billing?.seatLimit ? <span className="text-gray-400"> / {t.billing.seatLimit}</span> : null}</Td>
                    <Td>{t.estates}</Td>
                    <Td>{t.leads30}</Td>
                    <Td><span className="capitalize">{t.billing?.status}</span><p className="text-xs text-gray-500">{formatNaira(t.billing?.monthlyFee ?? 0)}/mo</p></Td>
                    <Td className="text-right"><Button size="sm" variant="secondary" onClick={() => setEditing(t)}>Manage</Button></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
        {tab === "reports" && (
          <Card padded={false}>
            {!reports ? <Loading /> : (
              <Table head={["Reported", "Firm", "Page", "Reason", "Status", ""]} empty={<Empty title="No reports" />}>
                {reports.map((r) => (
                  <tr key={r._id} className="align-top">
                    <Td className="text-gray-500">{formatDateTime(r.createdAt)}</Td>
                    <Td>{r.tenant?.name ?? "—"}</Td>
                    <Td><a href={r.url} target="_blank" rel="noopener" className="break-all text-xs text-emerald-700 underline">{r.url}</a></Td>
                    <Td className="max-w-sm">{r.reason}{r.contact && <p className="text-xs text-gray-500">Contact: {r.contact}</p>}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td>{r.status === "open" && <Button size="sm" variant="secondary" onClick={async () => { await api(`/admin/reports/${r._id}`, { method: "PATCH", body: { status: "reviewed" } }); void mutateReports(); }}>Mark reviewed</Button>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
        {tab === "messages" && (
          <Card padded={false}>
            {!messages ? <Loading /> : (
              <Table head={["When", "Channel", "To", "Subject", "Status"]} empty={<Empty title="No messages" />}>
                {messages.map((m) => (
                  <tr key={m._id}><Td className="text-gray-500">{formatDateTime(m.createdAt)}</Td><Td className="uppercase">{m.channel}</Td><Td>{m.to}</Td><Td className="max-w-xs truncate">{m.subject}</Td><Td><StatusBadge status={m.status} />{m.error && <p className="text-xs text-red-600">{m.error}</p>}</Td></tr>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New firm workspace">
        {created ? (
          <div className="space-y-3">
            <p className="text-sm">Workspace <strong>{created.slug}</strong> created. The owner has been emailed an invite; you can also send this link:</p>
            <div className="flex gap-2"><Input readOnly value={created.ownerInviteUrl} className="mt-0" /><Button variant="secondary" onClick={() => copy(created.ownerInviteUrl)}><Copy className="h-4 w-4" /></Button></div>
            <div className="flex justify-end"><Button onClick={() => setCreating(false)}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setErr(null);
            try {
              const r = await api<{ slug: string; ownerInviteUrl: string }>("/admin/tenants", { body: { name: fd.get("name"), slug: (fd.get("slug") as string) || undefined, ownerName: fd.get("ownerName"), ownerEmail: fd.get("ownerEmail"), plan: fd.get("plan"), cacNumber: (fd.get("cac") as string) || undefined } });
              setCreated(r); toast("Workspace created"); void mutate();
            } catch (er) { setErr(er); }
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Firm name"><Input name="name" required /></Field>
              <Field label="Slug (optional)" hint="Used in site URLs, e.g. oakwood"><Input name="slug" pattern="[a-z0-9-]{2,40}" /></Field>
              <Field label="Owner name"><Input name="ownerName" required /></Field>
              <Field label="Owner email"><Input name="ownerEmail" type="email" required /></Field>
              <Field label="Plan"><Select name="plan" defaultValue="pilot">{PLANS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
              <Field label="CAC / RC number" hint="Verify before estates go public"><Input name="cac" /></Field>
            </div>
            <ErrorNote error={err} />
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create workspace</Button></div>
          </form>
        )}
      </Modal>
      {editing && <TenantModal tenant={editing} onClose={() => setEditing(null)} onSaved={() => { toast("Firm updated"); void mutate(); }} />}
    </>
  );
}
