"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { CHANNEL_LABEL, formatDateTime, formatNaira, formatPhone, LEAD_STATUS_LABEL, RULE_LABEL, waDigits } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Input, LeadStatusBadge, Loading, Modal, PageHeader, Select, StatusBadge, Textarea, useToast } from "@/components/ui";

interface Person { id: string; name: string; code?: string }
interface Lead {
  _id: string; name: string; phone: string; email?: string; status: string; source: string; message?: string; preferredContactTime?: string; createdAt: string; lostReason?: string;
  realtor: Person | null; realtorId: string | null; people: Record<string, Person>;
  attribution?: { rule?: string; model?: string; windowStart?: string; decidedAt?: string; underReview?: boolean; manual?: boolean; manualReason?: string };
  evidence: { at: string; type: string; realtorId?: string | null; channel?: string; note?: string; estateId?: string }[];
  notes: { _id: string; authorId: string; kind: string; text: string; at: string }[];
  activity: { at: string; actorId?: string | null; action: string; detail?: string }[];
  estates: { _id: string; name: string }[];
  products: { _id: string; name: string; estateId: string; outrightPrice: number; plans: { name: string; totalPrice: number }[] }[];
  bookings: { _id: string; dateKey: string; time: string; status: string; estateId: string; attendees: number }[];
  payments: { _id: string; amount: number | null; type: string; reference: string; paidAt: string; provider: string }[];
  commissions: { _id: string; amount: number; status: string; salePrice: number }[];
  conflicts: { _id: string; status: string; claimantRealtorId: string; autoDecision?: string; createdAt: string }[];
  sale?: { productId?: string; planName?: string; price?: number };
  totalPaid: number | null;
}

const EVIDENCE_LABEL: Record<string, string> = {
  visit: "Viewed site", shortlink: "Opened share link", whatsapp_click: "Clicked WhatsApp", form: "Submitted enquiry", booking: "Booked inspection",
  manual: "Registered offline", payment: "Payment", override: "Admin override", merge: "Leads merged", window_reset: "Window reset", conflict_confirmed: "Attribution confirmed",
};

function OverrideModal({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const { data: realtors } = useApi<{ id: string; name: string; code: string }[]>(open ? "/realtors?status=active" : null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Override attribution">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true); setErr(null);
        try { await api(`/leads/${lead._id}/attribution`, { body: { realtorId: fd.get("realtorId") || null, reason: fd.get("reason") } }); onDone(); onClose(); } catch (er) { setErr(er); } finally { setBusy(false); }
      }}>
        <p className="text-sm text-gray-600">Overrides are audit-logged and shown to both realtors. Unapproved commissions follow the new attribution.</p>
        <Field label="Credit to"><Select name="realtorId" defaultValue={lead.realtorId ?? ""}><option value="">House (no realtor)</option>{realtors?.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</Select></Field>
        <Field label="Reason (required)"><Textarea name="reason" required minLength={3} rows={3} /></Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save override</Button></div>
      </form>
    </Modal>
  );
}

function MergeModal({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const { data } = useApi<{ items: { _id: string; name: string; phone: string }[] }>(open && q.length >= 3 ? `/leads?q=${encodeURIComponent(q)}&limit=10` : null);
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal open={open} onClose={onClose} title="Merge a duplicate lead into this one">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Use this when the same buyer used a different phone number. The other lead&apos;s history moves here and this lead&apos;s attribution is kept.</p>
        <Field label="Find the other lead"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" /></Field>
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
          {data?.items.filter((i) => i._id !== lead._id).map((i) => (
            <li key={i._id}><button className={`w-full px-3 py-2 text-left text-sm ${target === i._id ? "bg-emerald-50" : ""}`} onClick={() => setTarget(i._id)}>{i.name || "Unnamed"} · {formatPhone(i.phone)}</button></li>
          ))}
        </ul>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!target || reason.length < 3} onClick={async () => { try { await api(`/leads/${lead._id}/merge`, { body: { otherLeadId: target, reason } }); onDone(); onClose(); } catch (e) { setErr(e); } }}>Merge leads</Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [productId, setProductId] = useState(lead.sale?.productId ?? "");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const product = lead.products.find((p) => p._id === productId);
  const needsProduct = !lead.sale?.productId;
  return (
    <Modal open={open} onClose={onClose} title="Record a payment">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true); setErr(null);
        try {
          await api(`/leads/${lead._id}/payments`, { body: {
            amount: Number(String(fd.get("amount")).replace(/[^\d.]/g, "")), type: fd.get("type"), reference: fd.get("reference"),
            productId: needsProduct ? productId || undefined : undefined, planName: needsProduct ? (fd.get("planName") as string) || undefined : undefined,
            paidAt: fd.get("paidAt") || undefined, provider: "bank_transfer", note: fd.get("note") || undefined,
          } });
          onDone(); onClose();
        } catch (er) { setErr(er); } finally { setBusy(false); }
      }}>
        <p className="text-xs text-gray-500">Online payments via Paystack/Flutterwave arrive in Phase 2. Record bank transfers here; the payment inherits this lead&apos;s attribution.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type"><Select name="type" defaultValue="deposit"><option value="fee">Allocation / inspection fee</option><option value="deposit">Deposit</option><option value="installment">Installment</option><option value="outright">Outright</option></Select></Field>
          <Field label="Amount (₦)"><Input name="amount" required inputMode="numeric" placeholder="1,500,000" /></Field>
          <Field label="Transfer reference"><Input name="reference" required minLength={3} /></Field>
          <Field label="Date paid"><Input name="paidAt" type="date" /></Field>
        </div>
        {needsProduct && (
          <div className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2">
            <Field label="Product bought" hint="Required for the first sale payment"><Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Choose…</option>{lead.products.map((p) => <option key={p._id} value={p._id}>{p.name} · {formatNaira(p.outrightPrice)}</option>)}</Select></Field>
            <Field label="Payment plan"><Select name="planName" defaultValue=""><option value="">Outright</option>{product?.plans.map((pl) => <option key={pl.name} value={pl.name}>{pl.name} · {formatNaira(pl.totalPrice)}</option>)}</Select></Field>
          </div>
        )}
        <Field label="Note (optional)"><Input name="note" /></Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Record payment</Button></div>
      </form>
    </Modal>
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: lead, error, mutate } = useApi<Lead>(`/leads/${id}`);
  const can = useCan();
  const toast = useToast();
  const [modal, setModal] = useState<"override" | "merge" | "payment" | null>(null);
  const [noteKind, setNoteKind] = useState("call");

  if (error) return <ErrorNote error={error} />;
  if (!lead) return <Loading />;
  const person = (rid?: string | null) => (rid ? lead.people[rid]?.name ?? "Realtor" : "House");

  async function setStatus(status: string) {
    let lostReason: string | undefined;
    if (status === "lost") {
      lostReason = window.prompt("Why was this lead lost?") ?? undefined;
      if (!lostReason) return;
    }
    try { await api(`/leads/${lead!._id}`, { method: "PATCH", body: { status, lostReason } }); void mutate(); toast("Status updated"); } catch (e) { toast((e as Error).message, "error"); }
  }

  const timeline = [
    ...lead.evidence.map((e) => ({ at: e.at, title: EVIDENCE_LABEL[e.type] ?? e.type, sub: [e.realtorId !== undefined ? person(e.realtorId) : null, e.channel ? CHANNEL_LABEL[e.channel] ?? e.channel : null, e.note].filter(Boolean).join(" · "), kind: "evidence" })),
    ...lead.notes.map((n) => ({ at: n.at, title: `${n.kind === "note" ? "Note" : `Logged ${n.kind}`} by ${person(n.authorId)}`, sub: n.text, kind: "note" })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <>
      <PageHeader
        back={{ href: "/app/leads", label: "Leads" }}
        title={lead.name || "Unnamed buyer"}
        description={<span className="flex flex-wrap items-center gap-2"><LeadStatusBadge status={lead.status} />{formatPhone(lead.phone)}{lead.email && <> · {lead.email}</>}</span>}
        actions={<>
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"><Phone className="h-4 w-4" /> Call</a>
          <a href={`https://wa.me/${waDigits(lead.phone)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
        </>}
      />
      {lead.status === "merged" && <p className="mb-4 rounded-lg bg-gray-100 p-3 text-sm">This lead was merged into another lead.</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Pipeline status">
            <div className="flex flex-wrap gap-2">
              {Object.entries(LEAD_STATUS_LABEL).filter(([k]) => k !== "merged").map(([k, label]) => (
                <button key={k} disabled={lead.status === "merged"} onClick={() => k !== lead.status && void setStatus(k)}
                  className={`rounded-full border px-3 py-1 text-sm ${lead.status === k ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 text-gray-700 hover:border-gray-500"}`}>{label}</button>
              ))}
            </div>
            {lead.lostReason && <p className="mt-2 text-sm text-gray-600">Lost reason: {lead.lostReason}</p>}
            {lead.message && <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-gray-500">Buyer&apos;s message</p><p className="mt-1 text-gray-800">{lead.message}</p></div>}
            {lead.preferredContactTime && <p className="mt-2 text-sm text-gray-600">Prefers: {lead.preferredContactTime}</p>}
          </Card>

          <Card title="Log follow-up">
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get("text") ?? "");
              if (!text.trim()) return;
              await api(`/leads/${lead._id}/notes`, { body: { kind: noteKind, text } });
              form.reset();
              void mutate();
            }}>
              <div className="flex gap-2">
                {["call", "whatsapp", "meeting", "note"].map((k) => <button type="button" key={k} onClick={() => setNoteKind(k)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${noteKind === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}>{k}</button>)}
              </div>
              <Textarea name="text" rows={2} placeholder={noteKind === "call" ? "Called, she wants the 12-month plan…" : "Add a note"} />
              <div className="flex justify-end"><Button size="sm" type="submit">Save</Button></div>
            </form>
          </Card>

          <Card title="Evidence & activity timeline">
            <ol className="relative space-y-4 border-l border-gray-200 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${t.kind === "note" ? "bg-sky-500" : "bg-emerald-600"}`} />
                  <p className="text-sm font-medium text-gray-900">{t.title}</p>
                  {t.sub && <p className="text-sm text-gray-600">{t.sub}</p>}
                  <p className="text-xs text-gray-400">{formatDateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Attribution">
            <p className="text-lg font-semibold text-gray-900">{lead.realtor ? lead.realtor.name : "House (firm)"}</p>
            {lead.realtor?.code && <p className="text-sm text-gray-500">{lead.realtor.code}</p>}
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Rule</dt><dd>{RULE_LABEL[lead.attribution?.rule ?? ""] ?? lead.attribution?.rule}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Decided</dt><dd>{formatDateTime(lead.attribution?.decidedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Window from</dt><dd>{formatDateTime(lead.attribution?.windowStart)}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">
              {lead.attribution?.underReview && <Badge tone="amber">Under review</Badge>}
              {lead.attribution?.manual && <Badge>Manual: {lead.attribution.manualReason}</Badge>}
            </div>
            {lead.conflicts.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {lead.conflicts.length} competing claim{lead.conflicts.length > 1 ? "s" : ""}: {lead.conflicts.map((c) => `${person(c.claimantRealtorId)} (${c.status.replace("_", " ")})`).join(", ")}
                {can("leads.all") && <Link href="/app/conflicts" className="ml-1 underline">Open queue</Link>}
              </div>
            )}
            {can("attribution.override") && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setModal("override")}>Override</Button>
                <Button size="sm" variant="secondary" onClick={() => setModal("merge")}>Merge duplicate</Button>
                {lead.attribution?.manual && lead.attribution.underReview && <Button size="sm" onClick={async () => { await api(`/leads/${lead._id}/approve-manual`, { body: {} }); void mutate(); }}>Approve offline lead</Button>}
              </div>
            )}
          </Card>

          <Card title="Payments & commission" actions={can("payments.record") && <Button size="sm" onClick={() => setModal("payment")}>Record payment</Button>}>
            {lead.sale?.price ? (
              <div className="mb-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Sale price</span><span className="font-semibold">{formatNaira(lead.sale.price)}</span></div>
                {lead.totalPaid !== null && <div className="flex justify-between"><span className="text-gray-500">Paid so far</span><span className="font-semibold">{formatNaira(lead.totalPaid)}</span></div>}
                {lead.totalPaid !== null && <div className="mt-2 h-2 rounded bg-gray-100"><div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.min(100, ((lead.totalPaid ?? 0) / lead.sale.price) * 100)}%` }} /></div>}
              </div>
            ) : <p className="mb-3 text-sm text-gray-500">No sale recorded yet.</p>}
            <ul className="divide-y divide-gray-100 text-sm">
              {lead.payments.map((p) => <li key={p._id} className="flex justify-between py-2"><span className="capitalize">{p.type} <span className="text-xs text-gray-400">{p.reference}</span></span><span>{p.amount === null ? "Hidden" : formatNaira(p.amount)}</span></li>)}
            </ul>
            {lead.commissions.map((c) => <div key={c._id} className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>Commission {formatNaira(c.amount)}</span><StatusBadge status={c.status} /></div>)}
          </Card>

          <Card title="Inspections">
            {lead.bookings.length === 0 ? <p className="text-sm text-gray-500">No inspections booked.</p> : (
              <ul className="space-y-2 text-sm">
                {lead.bookings.map((b) => <li key={b._id} className="flex items-center justify-between"><span>{lead.estates.find((e) => e._id === b.estateId)?.name} · {b.dateKey} {b.time}</span><StatusBadge status={b.status} /></li>)}
              </ul>
            )}
          </Card>

          <Card title="Interested in">
            <p className="text-sm text-gray-800">{lead.estates.map((e) => e.name).join(", ") || "—"}</p>
            <p className="mt-2 text-xs text-gray-500">Source: {lead.source} · Created {formatDateTime(lead.createdAt)}</p>
          </Card>
        </div>
      </div>
      <OverrideModal lead={lead} open={modal === "override"} onClose={() => setModal(null)} onDone={() => { void mutate(); toast("Attribution updated"); }} />
      <MergeModal lead={lead} open={modal === "merge"} onClose={() => setModal(null)} onDone={() => { void mutate(); toast("Leads merged"); }} />
      {modal === "payment" && <PaymentModal lead={lead} open onClose={() => setModal(null)} onDone={() => { void mutate(); toast("Payment recorded"); }} />}
    </>
  );
}
