"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { api, qs, useApi } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { formatDate, formatNaira } from "@/lib/format";
import { Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Td, Textarea, useToast } from "@/components/ui";

interface Row {
  _id: string; amount: number; salePrice: number; status: string; createdAt: string; payoutReference?: string;
  rule?: { type: string; value: number; source?: string };
  realtor: { name?: string; code?: string; bank?: string | null }; lead: { _id: string; name: string; phone: string } | null; product?: string; estate?: string;
}
interface Resp { items: Row[]; total: number; summary: Record<string, { amount: number; count: number }> }

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).format(new Date());

/** AC-05 / AC-06: Pending → Earned → Approved → Paid, with statements per realtor. */
export default function CommissionsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const can = useCan();
  const { session } = useSession();
  const toast = useToast();
  const isRealtor = session.user.role === "realtor";
  const filters = { status: sp.get("status") ?? "", realtorId: sp.get("realtorId") ?? "", month: sp.get("month") ?? "" };
  const { data, mutate } = useApi<Resp>(`/commissions${qs({ ...filters, limit: 100 })}`);
  const { data: realtors } = useApi<{ id: string; name: string }[]>(!isRealtor && can("realtors.read") ? "/realtors" : null);
  const [modal, setModal] = useState<{ row: Row; kind: "pay" | "void" } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [month, setMonth] = useState(thisMonth());
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); router.replace(`/app/commissions?${n}`); };
  const canApprove = can("commission.approve");

  async function act(row: Row, action: "approve" | "earn") {
    try { await api(`/commissions/${row._id}/${action}`, { body: { note: action === "earn" ? "Marked earned manually" : undefined } }); toast(action === "earn" ? "Marked earned" : "Approved"); void mutate(); } catch (e) { toast((e as Error).message, "error"); }
  }

  const s = data?.summary ?? {};
  const statementQs = (format: string) => qs({ month, format, realtorId: isRealtor ? undefined : filters.realtorId || undefined });

  return (
    <>
      <PageHeader title={isRealtor ? "My commissions" : "Commissions"} description="Calculated automatically from firm rules on attributed sales."
        actions={canApprove && !!s.earned?.count && <Button onClick={async () => { const r = await api<{ approved: number }>(`/commissions/approve-all${qs(filters)}`, { body: {} }); toast(`${r.approved} approved`); void mutate(); }}>Approve all earned ({s.earned.count})</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={formatNaira(s.pending?.amount ?? 0)} sub={`${s.pending?.count ?? 0} sales in progress`} />
        <Stat label="Earned" value={formatNaira(s.earned?.amount ?? 0)} sub="Awaiting approval" />
        <Stat label="Approved" value={formatNaira(s.approved?.amount ?? 0)} sub="Awaiting payout" />
        <Stat label="Paid" value={formatNaira(s.paid?.amount ?? 0)} />
      </div>
      <Card className="mt-6" title="Monthly statement">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" /></Field>
          {!isRealtor && <p className="pb-2 text-sm text-gray-500">{filters.realtorId ? "For the selected realtor" : "Firm-wide report (filter by realtor for an individual statement)"}</p>}
          <a href={`/api/commissions/statement${statementQs("pdf")}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white"><FileDown className="h-4 w-4" /> PDF</a>
          <a href={`/api/commissions/statement${statementQs("csv")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"><FileDown className="h-4 w-4" /> CSV / Excel</a>
        </div>
      </Card>
      <Card className="mt-6" padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
          <Select value={filters.status} onChange={(e) => set("status", e.target.value)} className="mt-0 w-auto" aria-label="Status">
            <option value="">All statuses</option><option value="pending">Pending</option><option value="earned">Earned</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="void">Void</option>
          </Select>
          {!isRealtor && <Select value={filters.realtorId} onChange={(e) => set("realtorId", e.target.value)} className="mt-0 w-auto" aria-label="Realtor"><option value="">All realtors</option>{realtors?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
          <Input type="month" value={filters.month} onChange={(e) => set("month", e.target.value)} className="mt-0 w-auto" aria-label="Created in month" />
        </div>
        {!data ? <Loading /> : (
          <Table head={["Date", isRealtor ? "Client" : "Realtor", "Sale", "Rule", "Commission", "Status", ""]} empty={<Empty title="No commissions yet" description="Commissions are created when a payment is recorded on an attributed lead." />}>
            {data.items.map((c) => (
              <tr key={c._id}>
                <Td className="text-gray-500">{formatDate(c.createdAt)}</Td>
                <Td>
                  {isRealtor ? <Link href={`/app/leads/${c.lead?._id}`} className="font-medium hover:underline">{c.lead?.name || c.lead?.phone}</Link> : <><span className="font-medium">{c.realtor.name}</span> <span className="text-xs text-gray-400">{c.realtor.code}</span><p className="text-xs text-gray-500">Client: <Link href={`/app/leads/${c.lead?._id}`} className="hover:underline">{c.lead?.name || c.lead?.phone}</Link></p></>}
                </Td>
                <Td>{formatNaira(c.salePrice)}<p className="text-xs text-gray-500">{[c.estate, c.product].filter(Boolean).join(" · ")}</p></Td>
                <Td className="text-gray-600">{c.rule?.type === "percent" ? `${c.rule.value}%` : formatNaira(c.rule?.value ?? 0)}<p className="text-xs text-gray-400">{c.rule?.source}</p></Td>
                <Td className="font-semibold">{formatNaira(c.amount)}</Td>
                <Td><StatusBadge status={c.status} />{c.payoutReference && <p className="text-xs text-gray-500">{c.payoutReference}</p>}</Td>
                <Td className="text-right">
                  {canApprove && (
                    <div className="flex justify-end gap-1">
                      {c.status === "pending" && <Button size="sm" variant="ghost" onClick={() => act(c, "earn")}>Mark earned</Button>}
                      {c.status === "earned" && <Button size="sm" onClick={() => act(c, "approve")}>Approve</Button>}
                      {c.status === "approved" && <Button size="sm" onClick={() => { setErr(null); setModal({ row: c, kind: "pay" }); }}>Mark paid</Button>}
                      {(c.status === "pending" || c.status === "earned") && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setErr(null); setModal({ row: c, kind: "void" }); }}>Void</Button>}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.kind === "pay" ? `Pay ${formatNaira(modal.row.amount)} to ${modal.row.realtor.name}` : "Void commission"}>
        {modal && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              if (modal.kind === "pay") await api(`/commissions/${modal.row._id}/pay`, { body: { payoutReference: fd.get("ref"), note: fd.get("note") || undefined } });
              else await api(`/commissions/${modal.row._id}/void`, { body: { note: fd.get("note") } });
              setModal(null); toast(modal.kind === "pay" ? "Marked as paid" : "Commission voided"); void mutate();
            } catch (er) { setErr(er); }
          }}>
            {modal.kind === "pay" ? (
              <>
                <p className="text-sm text-gray-600">Bank: {modal.row.realtor.bank ?? "No bank details on file"}</p>
                <p className="text-xs text-gray-500">RealtorStack does not move money in the MVP — pay via your bank, then record the reference here.</p>
                <Field label="Transfer reference"><Input name="ref" required /></Field>
                <Field label="Note (optional)"><Input name="note" /></Field>
              </>
            ) : (
              <Field label="Reason (shown to the realtor)"><Textarea name="note" required minLength={3} rows={3} /></Field>
            )}
            <ErrorNote error={err} />
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" variant={modal.kind === "void" ? "danger" : "primary"}>{modal.kind === "pay" ? "Confirm payout" : "Void"}</Button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
