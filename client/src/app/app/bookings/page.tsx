"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { api, qs, useApi } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { formatDate, formatPhone } from "@/lib/format";
import { Button, Card, Empty, Input, Loading, PageHeader, Select, StatusBadge, Table, Td, useToast } from "@/components/ui";

interface Booking {
  _id: string; leadId: string; dateKey: string; time: string; status: string; attendees: number; name: string; phone: string;
  estate: { _id: string; name: string } | null; realtor: { name: string } | null;
}

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

/** IB-03: bookings per day / estate; mark attended or no-show. */
export default function BookingsPage() {
  const can = useCan();
  const { session } = useSession();
  const toast = useToast();
  const [view, setView] = useState<"upcoming" | "day" | "past">("upcoming");
  const [date, setDate] = useState(lagosToday());
  const [estateId, setEstateId] = useState("");
  const { data: estates } = useApi<{ _id: string; name: string }[]>("/estates");
  const params = view === "day" ? { date, estateId } : view === "upcoming" ? { from: lagosToday(), estateId, upcoming: 1, limit: 100 } : { to: lagosToday(), estateId, limit: 100 };
  const { data, mutate } = useApi<{ items: Booking[]; total: number }>(`/bookings${qs(params)}`);
  const canManage = can("bookings.manage") || session.user.role === "realtor";

  async function mark(b: Booking, status: string) {
    try {
      await api(`/bookings/${b._id}`, { method: "PATCH", body: { status } });
      toast(`Marked ${status.replace("_", " ")}`);
      void mutate();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  // Group by day for the run sheet
  const groups = new Map<string, Booking[]>();
  for (const b of data?.items ?? []) groups.set(b.dateKey, [...(groups.get(b.dateKey) ?? []), b]);

  return (
    <>
      <PageHeader title="Site inspections" description="Who is coming, when, and who brought them."
        actions={<a href={`/api/bookings/export.csv${qs(params)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"><Download className="h-4 w-4" /> Export</a>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["upcoming", "day", "past"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full border px-3 py-1 text-sm capitalize ${view === v ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white"}`}>{v === "day" ? "By day" : v}</button>
        ))}
        {view === "day" && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0 w-auto" aria-label="Date" />}
        <Select value={estateId} onChange={(e) => setEstateId(e.target.value)} className="mt-0 w-auto" aria-label="Estate"><option value="">All estates</option>{estates?.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}</Select>
      </div>
      {!data ? <Loading /> : data.items.length === 0 ? <Card><Empty title="No inspections" description="Bookings from realtor sites will appear here." /></Card> : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, items]) => (
            <Card key={day} padded={false} title={`${formatDate(`${day}T12:00:00+01:00`, { weekday: "long", day: "numeric", month: "long" })} · ${items.reduce((s, b) => s + (b.status !== "cancelled" ? b.attendees : 0), 0)} people`}>
              <Table head={["Time", "Buyer", "Estate", "Realtor", "Status", ""]}>
                {items.map((b) => (
                  <tr key={b._id}>
                    <Td className="font-medium">{b.time}</Td>
                    <Td><Link href={`/app/leads/${b.leadId}`} className="font-medium hover:underline">{b.name}</Link><p className="text-xs text-gray-500">{formatPhone(b.phone)} · {b.attendees} {b.attendees === 1 ? "person" : "people"}</p></Td>
                    <Td>{b.estate?.name}</Td>
                    <Td>{b.realtor?.name ?? <span className="text-gray-400">House</span>}</Td>
                    <Td><StatusBadge status={b.status} /></Td>
                    <Td className="text-right">
                      {canManage && b.status === "booked" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => mark(b, "attended")}>Attended</Button>
                          <Button size="sm" variant="ghost" onClick={() => mark(b, "no_show")}>No-show</Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
