"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { CHANNEL_LABEL, formatDateTime, formatPhone } from "@/lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, Modal, PageHeader, Tabs, Textarea, useToast } from "@/components/ui";

interface Person { id: string; name: string; code?: string }
interface ConflictItem {
  _id: string; status: string; model: string; autoDecision?: string; createdAt: string;
  current: Person | null; claimant: Person | null;
  lead: { id: string; name: string; phone: string; status: string; realtor: Person | null; windowStart?: string } | null;
  timeline: { at: string; type: string; channel?: string; note?: string; realtor: Person | null }[];
  resolution?: { reason?: string; at?: string };
}

const TYPE: Record<string, string> = { visit: "viewed site", shortlink: "opened link", whatsapp_click: "clicked WhatsApp", form: "sent enquiry", booking: "booked inspection", manual: "offline entry", override: "override", merge: "merge" };

/** AC-03 / flow 12.4: review the evidence timeline and decide. */
export default function ConflictsPage() {
  const can = useCan();
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "auto_resolved" | "resolved">("open");
  const { data, mutate } = useApi<{ items: ConflictItem[]; counts: Record<string, number> }>(`/conflicts?status=${status}`);
  const [resolving, setResolving] = useState<{ c: ConflictItem; realtor: Person | null } | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);

  return (
    <>
      <PageHeader title="Attribution conflicts" description="When two realtors have a valid claim on the same buyer, the full evidence trail lands here." />
      <Tabs value={status} onChange={setStatus} tabs={[
        { value: "open", label: <>Needs review {data?.counts.open ? <Badge tone="amber" className="ml-1">{data.counts.open}</Badge> : null}</> },
        { value: "auto_resolved", label: <>Auto-resolved {data?.counts.auto_resolved ? <span className="ml-1 text-gray-400">{data.counts.auto_resolved}</span> : null}</> },
        { value: "resolved", label: "Resolved" },
      ]} />
      <div className="mt-4 space-y-4">
        {!data ? <Loading /> : data.items.length === 0 ? (
          <Card><Empty title={status === "open" ? "No conflicts waiting 🎉" : "Nothing here"} description={status === "auto_resolved" ? "Competing claims decided automatically by your attribution rule appear here, so you can still review them." : undefined} /></Card>
        ) : data.items.map((c) => (
          <Card key={c._id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/app/leads/${c.lead?.id}`} className="text-lg font-semibold text-gray-900 hover:underline">{c.lead?.name || "Unnamed buyer"}</Link>
                <p className="text-sm text-gray-500">{formatPhone(c.lead?.phone)} · flagged {formatDateTime(c.createdAt)}</p>
              </div>
              {c.status === "auto_resolved" && <Badge>{c.autoDecision === "kept_original" ? "Kept original realtor" : "Moved to claimant"} ({c.model.replace(/_/g, " ")})</Badge>}
              {c.status === "resolved" && <Badge tone="green">Resolved: {c.resolution?.reason}</Badge>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase text-emerald-800">Currently credited</p>
                <p className="font-semibold">{c.lead?.realtor?.name ?? "House"} <span className="text-xs font-normal text-gray-500">{c.lead?.realtor?.code}</span></p>
                <p className="text-xs text-gray-600">Window started {formatDateTime(c.lead?.windowStart)}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase text-amber-800">Competing claim</p>
                <p className="font-semibold">{c.claimant?.name} <span className="text-xs font-normal text-gray-500">{c.claimant?.code}</span></p>
              </div>
            </div>
            <details className="mt-4" open={c.status === "open"}>
              <summary className="cursor-pointer text-sm font-medium text-gray-700">Evidence timeline ({c.timeline.length})</summary>
              <ol className="mt-2 space-y-1.5 border-l border-gray-200 pl-4 text-sm">
                {c.timeline.map((t, i) => (
                  <li key={i}><span className="text-gray-400">{formatDateTime(t.at)}</span> — <strong>{t.realtor?.name ?? "No realtor"}</strong> {TYPE[t.type] ?? t.type}{t.channel ? ` via ${CHANNEL_LABEL[t.channel] ?? t.channel}` : ""}{t.note ? ` (${t.note})` : ""}</li>
                ))}
              </ol>
            </details>
            {can("attribution.override") && c.status !== "resolved" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setResolving({ c, realtor: c.lead?.realtor ?? null }); setReason(""); setErr(null); }}>Confirm {c.lead?.realtor?.name ?? "House"}</Button>
                {c.claimant && <Button size="sm" variant="secondary" onClick={() => { setResolving({ c, realtor: c.claimant }); setReason(""); setErr(null); }}>Give to {c.claimant.name}</Button>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <Modal open={!!resolving} onClose={() => setResolving(null)} title={`Credit ${resolving?.realtor?.name ?? "House"}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Both realtors will see this decision and your reason. It is permanently audit-logged.</p>
          <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Buyer first opened Tobi's link 9 days earlier; Amaka's click came after the enquiry." /></Field>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolving(null)}>Cancel</Button>
            <Button disabled={reason.trim().length < 3} onClick={async () => {
              try { await api(`/conflicts/${resolving!.c._id}/resolve`, { body: { realtorId: resolving!.realtor?.id ?? null, reason } }); setResolving(null); toast("Conflict resolved"); void mutate(); } catch (e) { setErr(e); }
            }}>Confirm decision</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
