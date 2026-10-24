"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { api, qs, useApi } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { formatPhone, LEAD_STATUS_LABEL, timeAgo } from "@/lib/format";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, LeadStatusBadge, Loading, Modal, PageHeader, Pills, Select, Table, Td, Textarea, useToast } from "@/components/ui";

interface LeadRow {
  _id: string; name: string; phone: string; email?: string; status: string; source: string; createdAt: string; updatedAt: string;
  realtor: { id: string; name: string; code?: string } | null; estates: string[]; attribution?: { rule?: string; manual?: boolean; underReview?: boolean };
}
interface Resp { items: LeadRow[]; total: number; page: number; limit: number; statusCounts: Record<string, number> }

function ManualLeadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { session } = useSession();
  const isRealtor = session.user.role === "realtor";
  const { data: realtors } = useApi<{ id: string; name: string; code: string; status: string }[]>(open && !isRealtor ? "/realtors?status=active" : null);
  const { data: estates } = useApi<{ _id: string; name: string }[]>(open ? "/estates" : null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal open={open} onClose={onClose} title="Register an offline lead">
      <form id="manual-lead" className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true); setErr(null);
        try {
          await api("/leads/manual", { body: { name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email") || "", realtorId: fd.get("realtorId") || null, estateId: fd.get("estateId") || undefined, reason: fd.get("reason") } });
          toast(isRealtor ? "Submitted for approval" : "Lead registered");
          onDone(); onClose();
        } catch (er) { setErr(er); } finally { setBusy(false); }
      }}>
        <p className="text-xs text-gray-500">Walk-ins and phone calls. Offline leads are flagged “manual” in reports{isRealtor ? " and need admin approval" : ""}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Buyer name"><Input name="name" required minLength={2} /></Field>
          <Field label="Phone"><Input name="phone" required type="tel" /></Field>
          <Field label="Email (optional)"><Input name="email" type="email" /></Field>
          <Field label="Estate"><Select name="estateId" defaultValue=""><option value="">—</option>{estates?.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}</Select></Field>
        </div>
        {!isRealtor && (
          <Field label="Credit to realtor"><Select name="realtorId" defaultValue=""><option value="">House (no realtor)</option>{realtors?.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</Select></Field>
        )}
        <Field label="Reason" hint="e.g. Walk-in at Lekki office, referred by Tobi"><Textarea name="reason" required minLength={3} rows={2} /></Field>
        <ErrorNote error={err} />
      </form>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="manual-lead" loading={busy}>Register lead</Button></div>
    </Modal>
  );
}

export default function LeadsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const can = useCan();
  const { session } = useSession();
  const isRealtor = session.user.role === "realtor";
  const [manual, setManual] = useState(false);
  const filters = { status: sp.get("status") ?? "", q: sp.get("q") ?? "", realtorId: sp.get("realtorId") ?? "", estateId: sp.get("estateId") ?? "", page: sp.get("page") ?? "1", review: sp.get("review") ?? "" };
  const { data, error, mutate } = useApi<Resp>(`/leads${qs(filters)}`, { keepPreviousData: true });
  const { data: realtors } = useApi<{ id: string; name: string }[]>(can("realtors.read") ? "/realtors" : null);
  const { data: estates } = useApi<{ _id: string; name: string }[]>("/estates");
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`/app/leads?${next.toString()}`);
  };
  const manualAllowed = isRealtor ? session.tenant?.manualLeads === "realtor_request" : can("leads.write");

  return (
    <>
      <PageHeader
        title={isRealtor ? "My leads" : "Lead inbox"}
        description={isRealtor ? "Buyers who reached you through your links. Follow up fast — every lead is credited to you." : "Every enquiry, WhatsApp click and booking across the network."}
        actions={<>
          <a href={`/api/leads/export.csv${qs(filters)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"><Download className="h-4 w-4" /> Export CSV</a>
          {manualAllowed && <Button onClick={() => setManual(true)}><Plus className="h-4 w-4" /> Offline lead</Button>}
        </>}
      />
      <div className="mb-4">
        <Pills value={filters.status} onChange={(v) => set("status", v)}
          options={[{ value: "", label: "All" }, ...Object.entries(LEAD_STATUS_LABEL).filter(([k]) => k !== "merged").map(([k, label]) => ({ value: k, label, count: data?.statusCounts?.[k] }))]} />
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
          <form className="relative min-w-[200px] flex-1" onSubmit={(e) => { e.preventDefault(); set("q", String(new FormData(e.currentTarget).get("q") ?? "")); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input name="q" defaultValue={filters.q} placeholder="Search name, phone or email" className="mt-0 pl-9" />
          </form>
          {!isRealtor && (
            <Select value={filters.realtorId} onChange={(e) => set("realtorId", e.target.value)} className="mt-0 w-auto" aria-label="Realtor">
              <option value="">All realtors</option><option value="house">House (no realtor)</option>
              {realtors?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
          <Select value={filters.estateId} onChange={(e) => set("estateId", e.target.value)} className="mt-0 w-auto" aria-label="Estate">
            <option value="">All estates</option>{estates?.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </Select>
          {!isRealtor && <label className="flex items-center gap-2 px-2 text-sm text-gray-700"><input type="checkbox" checked={filters.review === "1"} onChange={(e) => set("review", e.target.checked ? "1" : "")} /> Under review</label>}
        </div>
        <ErrorNote error={error} />
        {!data ? <Loading /> : (
          <Table head={["Buyer", "Status", isRealtor ? "Interest" : "Realtor", "Source", "Updated"]} empty={<Empty title="No leads match" description={isRealtor ? "Share your property links to start receiving leads." : "Try a different filter."} />}>
            {data.items.map((l) => (
              <tr key={l._id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/app/leads/${l._id}`)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={l.name || l.phone} size={34} />
                    <div className="min-w-0">
                      <Link href={`/app/leads/${l._id}`} className="font-medium text-gray-900 hover:text-emerald-700" onClick={(e) => e.stopPropagation()}>{l.name || "Unnamed buyer"}</Link>
                      <p className="text-xs text-gray-500">{formatPhone(l.phone)}</p>
                    </div>
                  </div>
                </Td>
                <Td><div className="flex flex-wrap gap-1"><LeadStatusBadge status={l.status} />{l.attribution?.underReview && <Badge tone="amber">Review</Badge>}{l.attribution?.manual && <Badge>Manual</Badge>}</div></Td>
                <Td>{isRealtor ? <span className="text-sm text-gray-600">{l.estates.join(", ") || "—"}</span> : l.realtor ? <span>{l.realtor.name} <span className="text-xs text-gray-400">{l.realtor.code}</span></span> : <span className="text-gray-400">House</span>}</Td>
                <Td className="capitalize text-gray-600">{l.source.replace("_", " ")}</Td>
                <Td className="text-gray-500">{timeAgo(l.updatedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">{(data.page - 1) * data.limit + 1}–{Math.min(data.total, data.page * data.limit)} of {data.total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => set("page", String(data.page - 1))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={data.page * data.limit >= data.total} onClick={() => set("page", String(data.page + 1))}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <ManualLeadModal open={manual} onClose={() => setManual(false)} onDone={() => void mutate()} />
    </>
  );
}
