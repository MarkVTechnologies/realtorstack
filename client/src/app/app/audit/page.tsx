"use client";

import { useState } from "react";
import { qs, useApi } from "@/lib/api";
import { formatDateTime, ROLE_LABEL } from "@/lib/format";
import { Button, Card, Empty, Loading, PageHeader, Select, Table, Td } from "@/components/ui";

interface Entry { _id: string; action: string; entity: string; before?: unknown; after?: unknown; reason?: string; at: string; actor: { name: string; role: string } | null }

const GROUPS = [
  ["", "All activity"], ["attribution", "Attribution & overrides"], ["commission", "Commission approvals"], ["product", "Price changes"],
  ["realtor", "Realtor status"], ["payment", "Payments"], ["firm", "Settings"], ["lead", "Lead changes"], ["platform", "Platform actions"],
] as const;

/** NFR Auditability: immutable log of attribution changes, overrides, price changes, approvals. */
export default function AuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useApi<{ items: Entry[]; total: number; limit: number }>(`/audit${qs({ action, page, limit: 50 })}`);
  return (
    <>
      <PageHeader title="Audit log" description="Every attribution decision, override, price change and approval. Entries cannot be edited or deleted." />
      <Card padded={false}>
        <div className="border-b border-gray-100 p-3">
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="mt-0 w-auto" aria-label="Filter">{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </div>
        {!data ? <Loading /> : (
          <Table head={["When", "Who", "Action", "Details"]} empty={<Empty title="No entries" />}>
            {data.items.map((e) => (
              <tr key={e._id} className="align-top">
                <Td className="whitespace-nowrap text-gray-500">{formatDateTime(e.at)}</Td>
                <Td>{e.actor ? <>{e.actor.name}<p className="text-xs text-gray-400">{ROLE_LABEL[e.actor.role]}</p></> : <span className="text-gray-400">System</span>}</Td>
                <Td><span className="font-mono text-xs">{e.action}</span>{e.reason && <p className="mt-1 text-sm text-gray-700">“{e.reason}”</p>}</Td>
                <Td>
                  <details>
                    <summary className="cursor-pointer text-xs text-emerald-700">{e.entity}</summary>
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-[11px]">{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
                  </details>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {data && data.total > data.limit && (
          <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </>
  );
}
