"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatNairaShort, locationLine } from "@/lib/format";
import { Badge, Card, Empty, LinkButton, Loading, PageHeader, StatusBadge } from "@/components/ui";

interface EstateRow {
  _id: string; name: string; status: string; published: boolean; location: { state: string; lga?: string; area?: string };
  media?: { images?: { variants?: { sm?: string }; url: string }[] }; products: unknown[]; fromPrice: number | null; documents: string[];
}

export default function EstatesPage() {
  const can = useCan();
  const { data } = useApi<EstateRow[]>("/estates");
  return (
    <>
      <PageHeader title="Estates" description="Publish once — every realtor's site updates instantly." actions={can("estates.write") && <LinkButton href="/app/estates/new"><Plus className="h-4 w-4" /> Add estate</LinkButton>} />
      {!data ? <Loading /> : data.length === 0 ? (
        <Card><Empty title="No estates yet" description="Add your first estate with prices, payment plans and inspection days." action={can("estates.write") && <LinkButton href="/app/estates/new">Add estate</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((e) => {
            const img = e.media?.images?.[0];
            return (
              <Link key={e._id} href={can("estates.write") ? `/app/estates/${e._id}` : `/app/share`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.variants?.sm ?? img.url} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                ) : <div className="aspect-[16/9] bg-gradient-to-br from-emerald-700 to-amber-500" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">{e.name}</h2>
                    <div className="flex gap-1"><StatusBadge status={e.status} />{!e.published && <Badge tone="red">Hidden</Badge>}</div>
                  </div>
                  <p className="text-sm text-gray-500">{locationLine(e.location)}</p>
                  <p className="mt-2 text-sm"><span className="font-semibold">{formatNairaShort(e.fromPrice)}</span> <span className="text-gray-500">from · {e.products.length} products</span></p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
