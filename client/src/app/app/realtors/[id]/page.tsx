"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDateTime, formatNairaShort, formatPhone } from "@/lib/format";
import { Button, Card, ErrorNote, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Textarea, useToast } from "@/components/ui";

interface Detail {
  id: string; name: string; phone?: string; email?: string; status: string; createdAt: string; lastLoginAt?: string; leads: number; openLeads: number;
  profile: { code: string; slug: string; siteUrl: string; whatsapp?: string; bio?: string; areasServed?: string[]; source: string; activatedAt?: string; lastShareAt?: string; bank?: { bankName?: string; accountName?: string; accountNumberMasked?: string } } | null;
}

export default function RealtorDetail() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const toast = useToast();
  const { data, error, mutate } = useApi<Detail>(`/realtors/${id}`);
  const { data: stats } = useApi<{ totals: { visits: number; leads: number; bookings: number; sales: number }; commission: Record<string, number> }>(`/analytics/realtor?realtorId=${id}`);
  const { data: realtors } = useApi<{ id: string; name: string }[]>("/realtors?status=active");
  const [action, setAction] = useState<"suspended" | "exited" | null>(null);
  const [err, setErr] = useState<unknown>(null);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const p = data.profile;

  async function change(status: string, extra: Record<string, unknown> = {}) {
    try {
      const r = await api<{ reassigned: number }>(`/realtors/${id}/status`, { method: "PATCH", body: { status, ...extra } });
      toast(`Status: ${status}${r.reassigned ? ` · ${r.reassigned} open leads reassigned` : ""}`);
      setAction(null);
      void mutate();
    } catch (e) { setErr(e); }
  }

  return (
    <>
      <PageHeader back={{ href: "/app/realtors", label: "Realtors" }} title={data.name}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={data.status} />{p?.code} · {formatPhone(data.phone)}{data.email && ` · ${data.email}`}</span>}
        actions={can("realtors.manage") && <>
          {data.status === "pending" && <Button onClick={() => change("active")}>Approve</Button>}
          {data.status === "invited" && <Button variant="secondary" onClick={async () => { await api(`/realtors/${id}/resend-invite`, { body: {} }); toast("Invite resent"); }}>Resend invite</Button>}
          {data.status === "suspended" && <Button onClick={() => change("active")}>Reactivate</Button>}
          {data.status === "active" && <Button variant="secondary" onClick={() => { setErr(null); setAction("suspended"); }}>Suspend</Button>}
          {data.status !== "exited" && <Button variant="ghost" className="text-red-600" onClick={() => { setErr(null); setAction("exited"); }}>Mark exited</Button>}
        </>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Clicks (30d)" value={stats?.totals.visits ?? "…"} />
        <Stat label="Leads (30d)" value={stats?.totals.leads ?? "…"} sub={`${data.leads} all time · ${data.openLeads} open`} />
        <Stat label="Inspections (30d)" value={stats?.totals.bookings ?? "…"} />
        <Stat label="Sales (30d)" value={stats?.totals.sales ?? "…"} />
        <Stat label="Commission" value={formatNairaShort(Object.entries(stats?.commission ?? {}).reduce((s, [, v]) => s + v, 0))} sub={`${formatNairaShort(stats?.commission?.pending ?? 0)} pending`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Site & profile">
          {p ? (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-gray-500">Website</dt><dd><a href={p.siteUrl} target="_blank" rel="noopener" className="text-emerald-700 hover:underline">{p.siteUrl}</a></dd></div>
              <div><dt className="text-gray-500">WhatsApp</dt><dd>{formatPhone(p.whatsapp) || "—"}</dd></div>
              <div><dt className="text-gray-500">Areas</dt><dd>{p.areasServed?.join(", ") || "—"}</dd></div>
              <div><dt className="text-gray-500">Joined via</dt><dd className="capitalize">{p.source.replace("_", " ")} · activated {formatDateTime(p.activatedAt)}</dd></div>
              <div><dt className="text-gray-500">Last share</dt><dd>{formatDateTime(p.lastShareAt)}</dd></div>
              <div><dt className="text-gray-500">Bio</dt><dd className="whitespace-pre-line">{p.bio || "—"}</dd></div>
            </dl>
          ) : <p className="text-sm text-gray-500">No profile.</p>}
        </Card>
        <Card title="Commission bank details">
          {p?.bank?.accountNumberMasked ? (
            <p className="text-sm">{p.bank.bankName} · {p.bank.accountNumberMasked}<br /><span className="text-gray-500">{p.bank.accountName}</span></p>
          ) : <p className="text-sm text-gray-500">The realtor hasn&apos;t added bank details yet.</p>}
          <p className="mt-2 text-xs text-gray-400">Account numbers are encrypted and masked after saving.</p>
          <div className="mt-4 flex gap-2">
            <Link href={`/app/leads?realtorId=${id}`} className="text-sm font-medium text-emerald-700 hover:underline">View leads →</Link>
            <Link href={`/app/commissions?realtorId=${id}`} className="text-sm font-medium text-emerald-700 hover:underline">View commissions →</Link>
          </div>
        </Card>
      </div>
      <Modal open={!!action} onClose={() => setAction(null)} title={action === "exited" ? `${data.name} is leaving the firm` : `Suspend ${data.name}`}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const reassign = fd.get("reassign") as string;
          void change(action!, { reason: fd.get("reason"), ...(reassign !== "keep" ? { reassignTo: reassign || null } : {}) });
        }}>
          <p className="text-sm text-gray-600">{action === "exited" ? "Earned commissions stay theirs. Their site will show your firm's fallback page." : "Their site will show your firm's fallback page and they can't sign in. Historical attribution is preserved."}</p>
          <Field label="Reason"><Textarea name="reason" required rows={2} /></Field>
          <Field label={`Open leads (${data.openLeads})`} hint="Reassigned realtors are notified; every change is audit-logged.">
            <Select name="reassign" defaultValue={action === "exited" ? "" : "keep"}>
              <option value="keep">Keep with {data.name}</option>
              <option value="">Move to House</option>
              {realtors?.filter((r) => r.id !== id).map((r) => <option key={r.id} value={r.id}>Reassign to {r.name}</option>)}
            </Select>
          </Field>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button type="submit" variant="danger">Confirm</Button></div>
        </form>
      </Modal>
    </>
  );
}
