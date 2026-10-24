"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { qs, useApi } from "@/lib/api";
import { formatDate, formatNaira, formatPhone } from "@/lib/format";
import { Card, Empty, Input, Loading, PageHeader, Select, Table, Td } from "@/components/ui";

interface Payment { _id: string; amount: number | null; type: string; reference: string; paidAt: string; provider: string; note?: string; realtor: string; lead: { _id: string; name: string; phone: string } | null }

export default function PaymentsPage() {
  const [filters, setFilters] = useState({ from: "", to: "", type: "" });
  const { data } = useApi<{ items: Payment[]; total: number; totalAmount: number | null }>(`/payments${qs({ ...filters, limit: 100 })}`);
  return (
    <>
      <PageHeader title="Payments ledger" description={data?.totalAmount != null ? `${formatNaira(data.totalAmount)} across ${data.total} payments` : undefined}
        actions={<a href={`/api/payments${qs({ ...filters, format: "csv" })}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"><Download className="h-4 w-4" /> Download ledger</a>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
          <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="mt-0 w-auto" aria-label="From" />
          <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="mt-0 w-auto" aria-label="To" />
          <Select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="mt-0 w-auto" aria-label="Type"><option value="">All types</option><option value="fee">Fee</option><option value="deposit">Deposit</option><option value="installment">Installment</option><option value="outright">Outright</option></Select>
        </div>
        {!data ? <Loading /> : (
          <Table head={["Date", "Client", "Type", "Amount", "Reference", "Realtor"]} empty={<Empty title="No payments recorded" description="Record bank transfers from a lead's page." />}>
            {data.items.map((p) => (
              <tr key={p._id}>
                <Td className="text-gray-500">{formatDate(p.paidAt)}</Td>
                <Td><Link href={`/app/leads/${p.lead?._id}`} className="font-medium hover:underline">{p.lead?.name || "—"}</Link><p className="text-xs text-gray-500">{formatPhone(p.lead?.phone)}</p></Td>
                <Td className="capitalize">{p.type}</Td>
                <Td className="font-semibold">{p.amount === null ? "Hidden" : formatNaira(p.amount)}</Td>
                <Td className="font-mono text-xs">{p.reference}<p className="font-sans text-gray-400">{p.provider.replace("_", " ")}</p></Td>
                <Td>{p.realtor}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
