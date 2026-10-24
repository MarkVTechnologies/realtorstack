"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { api, uploadDocument, uploadImage, useApi } from "@/lib/api";
import { formatDateTime, formatNaira, WEEKDAYS } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, Select, Textarea, Toggle, useToast } from "@/components/ui";

interface Img { _id?: string; url: string; variants?: Record<string, string>; width?: number; height?: number; alt?: string }
interface Plan { name: string; depositAmount: number; tenorMonths: number; monthlyAmount: number; totalPrice?: number }
interface Product { _id: string; name: string; type: string; size?: string; outrightPrice: number; plans: Plan[]; status: string; promo?: { price?: number; label?: string; startsAt?: string; endsAt?: string } | null; commission?: { type?: string; value?: number } | null }
export interface EstateDoc {
  _id?: string; name: string; tagline?: string; description?: string; status: string; published: boolean;
  location: { state: string; lga?: string; area?: string; address?: string; lat?: number | null; lng?: number | null };
  documents: string[]; amenities: string[];
  media: { images: Img[]; videos: { url: string; title?: string }[]; sitePlanUrl?: string | null; brochureUrl?: string | null };
  inspection: { days: number[]; times: string[]; meetingPoint?: string; transportNotes?: string; daysAhead?: number; capacityPerSlot?: number; blackoutDates?: string[] };
  commission?: { type?: string; value?: number } | null; shareCaption?: string; products?: Product[];
}

const EMPTY: EstateDoc = {
  name: "", status: "selling", published: true, location: { state: "Lagos" }, documents: [], amenities: [],
  media: { images: [], videos: [] }, inspection: { days: [6], times: ["10:00"], daysAhead: 30, capacityPerSlot: 0 },
};

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;

function ProductModal({ estateId, product, onClose, onSaved }: { estateId: string; product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [plans, setPlans] = useState<Plan[]>(product?.plans ?? []);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={product ? `Edit ${product.name}` : "Add product / plot type"} wide>
      <form id="product-form" className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const promoPrice = num(fd.get("promoPrice"));
        const body = {
          name: fd.get("name"), type: fd.get("type"), size: fd.get("size") || undefined, outrightPrice: num(fd.get("outrightPrice")), status: fd.get("status"),
          plans: plans.filter((p) => p.name).map((p) => ({ ...p, totalPrice: p.totalPrice || undefined })),
          promo: promoPrice ? { price: promoPrice, label: fd.get("promoLabel") || null, startsAt: fd.get("promoStart") || null, endsAt: fd.get("promoEnd") || null } : null,
          commission: fd.get("commType") ? { type: fd.get("commType"), value: num(fd.get("commValue")) } : null,
        };
        setBusy(true); setErr(null);
        try {
          if (product) await api(`/estates/products/${product._id}`, { method: "PATCH", body });
          else await api(`/estates/${estateId}/products`, { body });
          onSaved(); onClose();
        } catch (er) { setErr(er); } finally { setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" className="sm:col-span-2"><Input name="name" required defaultValue={product?.name} placeholder="300 sqm plot" /></Field>
          <Field label="Type"><Select name="type" defaultValue={product?.type ?? "plot"}><option value="plot">Plot</option><option value="house">House</option><option value="apartment">Apartment</option><option value="commercial">Commercial</option><option value="other">Other</option></Select></Field>
          <Field label="Size"><Input name="size" defaultValue={product?.size} placeholder="300 sqm" /></Field>
          <Field label="Outright price (₦)" className="sm:col-span-2"><Input name="outrightPrice" required inputMode="numeric" defaultValue={product?.outrightPrice} /></Field>
          <Field label="Availability"><Select name="status" defaultValue={product?.status ?? "available"}><option value="available">Available</option><option value="sold_out">Sold out</option></Select></Field>
        </div>
        <div>
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Installment plans</p><Button type="button" size="sm" variant="secondary" onClick={() => setPlans((p) => [...p, { name: `${(p.length + 1) * 6} months`, depositAmount: 0, tenorMonths: (p.length + 1) * 6, monthlyAmount: 0 }])}>Add plan</Button></div>
          <div className="mt-2 space-y-2">
            {plans.map((p, i) => {
              const upd = (k: keyof Plan, v: string) => setPlans((all) => all.map((x, j) => (j === i ? { ...x, [k]: k === "name" ? v : Number(v.replace(/[^\d.]/g, "")) || 0 } : x)));
              const total = p.depositAmount + p.tenorMonths * p.monthlyAmount;
              return (
                <div key={i} className="grid items-end gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-[1.2fr_1fr_0.6fr_1fr_auto]">
                  <Field label="Plan name"><Input value={p.name} onChange={(e) => upd("name", e.target.value)} /></Field>
                  <Field label="Deposit (₦)"><Input value={p.depositAmount || ""} onChange={(e) => upd("depositAmount", e.target.value)} inputMode="numeric" /></Field>
                  <Field label="Months"><Input value={p.tenorMonths || ""} onChange={(e) => upd("tenorMonths", e.target.value)} inputMode="numeric" /></Field>
                  <Field label="Monthly (₦)" hint={`Total ${formatNaira(total)}`}><Input value={p.monthlyAmount || ""} onChange={(e) => upd("monthlyAmount", e.target.value)} inputMode="numeric" /></Field>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPlans((all) => all.filter((_, j) => j !== i))} aria-label="Remove plan"><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
            {plans.length === 0 && <p className="text-sm text-gray-500">Outright only. Add a plan to show deposit and monthly amounts.</p>}
          </div>
        </div>
        <details className="rounded-lg border border-gray-200 p-3" open={!!product?.promo?.price}>
          <summary className="cursor-pointer text-sm font-semibold">Promo price (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field label="Promo price (₦)"><Input name="promoPrice" inputMode="numeric" defaultValue={product?.promo?.price} /></Field>
            <Field label="Label"><Input name="promoLabel" defaultValue={product?.promo?.label} placeholder="Early-bird price" /></Field>
            <Field label="Starts"><Input name="promoStart" type="date" defaultValue={product?.promo?.startsAt?.slice(0, 10)} /></Field>
            <Field label="Ends" hint="Shown as a countdown"><Input name="promoEnd" type="date" defaultValue={product?.promo?.endsAt?.slice(0, 10)} /></Field>
          </div>
        </details>
        <details className="rounded-lg border border-gray-200 p-3" open={!!product?.commission?.type}>
          <summary className="cursor-pointer text-sm font-semibold">Commission override (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Rule"><Select name="commType" defaultValue={product?.commission?.type ?? ""}><option value="">Use estate / firm default</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
            <Field label="Value"><Input name="commValue" inputMode="decimal" defaultValue={product?.commission?.value} /></Field>
          </div>
        </details>
        <ErrorNote error={err} />
      </form>
      <div className="mt-4 flex justify-between gap-2">
        {product ? <Button variant="danger" size="sm" onClick={async () => { try { await api(`/estates/products/${product._id}`, { method: "DELETE" }); onSaved(); onClose(); } catch (e) { setErr(e); } }}>Delete</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={busy}>Save product</Button></div>
      </div>
    </Modal>
  );
}

function PriceHistory({ estateId }: { estateId: string }) {
  const { data } = useApi<{ _id: string; field: string; oldPrice?: number; newPrice?: number; changedAt: string; changedBy?: { name: string }; productId: string }[]>(`/estates/${estateId}/price-history`);
  if (!data?.length) return <p className="text-sm text-gray-500">No price changes yet.</p>;
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {data.slice(0, 15).map((h) => (
        <li key={h._id} className="flex flex-wrap justify-between gap-2 py-2">
          <span>{h.field.replace("plan:", "Plan ")}: {h.oldPrice != null ? formatNaira(h.oldPrice) : "—"} → <strong>{h.newPrice != null ? formatNaira(h.newPrice) : "removed"}</strong></span>
          <span className="text-gray-500">{h.changedBy?.name} · {formatDateTime(h.changedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export function EstateEditor({ initial }: { initial?: EstateDoc }) {
  const router = useRouter();
  const toast = useToast();
  const { data: meta } = useApi<{ states: string[]; documents: string[] }>("/estates/meta");
  const [e, setE] = useState<EstateDoc>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [productModal, setProductModal] = useState<Product | "new" | null>(null);
  const { data: fresh, mutate } = useApi<EstateDoc>(initial?._id ? `/estates/${initial._id}` : null, { fallbackData: initial });
  const products = fresh?.products ?? [];

  const set = <K extends keyof EstateDoc>(k: K, v: EstateDoc[K]) => setE((x) => ({ ...x, [k]: v }));
  const setLoc = (k: string, v: string | number | null) => setE((x) => ({ ...x, location: { ...x.location, [k]: v } }));
  const setInsp = (k: string, v: unknown) => setE((x) => ({ ...x, inspection: { ...x.inspection, [k]: v } }));
  const setMedia = (k: string, v: unknown) => setE((x) => ({ ...x, media: { ...x.media, [k]: v } }));

  async function save() {
    setBusy(true); setErr(null);
    const body = {
      name: e.name, tagline: e.tagline, description: e.description, status: e.status, published: e.published,
      location: { ...e.location, lat: e.location.lat ? Number(e.location.lat) : null, lng: e.location.lng ? Number(e.location.lng) : null },
      documents: e.documents, amenities: e.amenities.filter(Boolean),
      media: { images: e.media.images.map(({ url, variants, width, height, alt }) => ({ url, variants, width, height, alt })), videos: e.media.videos.filter((v) => v.url), sitePlanUrl: e.media.sitePlanUrl ?? null, brochureUrl: e.media.brochureUrl ?? null },
      inspection: e.inspection, commission: e.commission?.type ? { type: e.commission.type, value: Number(e.commission.value ?? 0) } : null, shareCaption: e.shareCaption,
    };
    try {
      if (e._id) {
        await api(`/estates/${e._id}`, { method: "PATCH", body });
        toast("Saved — realtor sites updated");
        void mutate();
      } else {
        const created = await api<{ _id: string }>("/estates", { body });
        toast("Estate created. Now add products and prices.");
        router.replace(`/app/estates/${created._id}`);
      }
    } catch (er) { setErr(er); } finally { setBusy(false); }
  }

  async function onImages(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: Img[] = [];
      for (const f of Array.from(files).slice(0, 10)) uploaded.push({ ...(await uploadImage(f)), alt: e.name });
      setMedia("images", [...e.media.images, ...uploaded]);
    } catch (er) { toast((er as Error).message, "error"); } finally { setUploading(false); }
  }

  if (!meta) return <Loading />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card title="Estate details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estate name" className="sm:col-span-2"><Input value={e.name} onChange={(x) => set("name", x.target.value)} required placeholder="Oak Gardens" /></Field>
            <Field label="Tagline" className="sm:col-span-2" hint="One line shown on cards and link previews"><Input value={e.tagline ?? ""} onChange={(x) => set("tagline", x.target.value)} maxLength={160} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={e.description ?? ""} onChange={(x) => set("description", x.target.value)} rows={6} /></Field>
          </div>
        </Card>
        <Card title="Location">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="State"><Select value={e.location.state} onChange={(x) => setLoc("state", x.target.value)}>{meta.states.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="LGA"><Input value={e.location.lga ?? ""} onChange={(x) => setLoc("lga", x.target.value)} /></Field>
            <Field label="Area"><Input value={e.location.area ?? ""} onChange={(x) => setLoc("area", x.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-3"><Input value={e.location.address ?? ""} onChange={(x) => setLoc("address", x.target.value)} /></Field>
            <Field label="Latitude" hint="Map pin (optional)"><Input value={e.location.lat ?? ""} onChange={(x) => setLoc("lat", x.target.value)} inputMode="decimal" /></Field>
            <Field label="Longitude"><Input value={e.location.lng ?? ""} onChange={(x) => setLoc("lng", x.target.value)} inputMode="decimal" /></Field>
          </div>
        </Card>
        <Card title="Photos, videos & documents">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {e.media.images.map((img, i) => (
              <div key={img.url} className="group relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.variants?.sm ?? img.url} alt="" className="aspect-[4/3] w-full object-cover" />
                {i === 0 && <Badge className="absolute left-1 top-1" tone="green">Cover</Badge>}
                <div className="absolute right-1 top-1 flex gap-1">
                  {i > 0 && <button type="button" className="rounded bg-white/90 px-1.5 text-xs" onClick={() => setMedia("images", [img, ...e.media.images.filter((_, j) => j !== i)])}>Cover</button>}
                  <button type="button" className="rounded bg-white/90 p-0.5" aria-label="Remove photo" onClick={() => setMedia("images", e.media.images.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-700">
              <ImagePlus className="h-6 w-6" />{uploading ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(x) => void onImages(x.target.files)} disabled={uploading} />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">Photos are compressed to WebP automatically for fast loading on 3G.</p>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Video links (YouTube, drone footage)</p>
            {e.media.videos.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input value={v.url} placeholder="https://youtu.be/…" className="mt-0" onChange={(x) => setMedia("videos", e.media.videos.map((y, j) => (j === i ? { ...y, url: x.target.value } : y)))} />
                <Input value={v.title ?? ""} placeholder="Title" className="mt-0 w-40" onChange={(x) => setMedia("videos", e.media.videos.map((y, j) => (j === i ? { ...y, title: x.target.value } : y)))} />
                <Button type="button" variant="ghost" onClick={() => setMedia("videos", e.media.videos.filter((_, j) => j !== i))} aria-label="Remove video"><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setMedia("videos", [...e.media.videos, { url: "" }])}>Add video link</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["sitePlanUrl", "brochureUrl"] as const).map((k) => (
              <div key={k} className="text-sm">
                <p className="font-medium">{k === "sitePlanUrl" ? "Site plan (PDF)" : "Brochure (PDF)"}</p>
                {e.media[k] ? (
                  <p className="mt-1 flex items-center gap-2"><a href={e.media[k]!} target="_blank" rel="noopener" className="text-emerald-700 underline">View PDF</a><button type="button" className="text-xs text-gray-500 underline" onClick={() => setMedia(k, null)}>Remove</button></p>
                ) : (
                  <input type="file" accept="application/pdf" className="mt-1 text-xs" onChange={async (x) => { const f = x.target.files?.[0]; if (!f) return; try { setMedia(k, (await uploadDocument(f)).url); } catch (er) { toast((er as Error).message, "error"); } }} />
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Inspection schedule">
          <p className="text-sm font-medium">Inspection days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => {
              const on = e.inspection.days.includes(i);
              return <button key={d} type="button" aria-pressed={on} onClick={() => setInsp("days", on ? e.inspection.days.filter((x) => x !== i) : [...e.inspection.days, i].sort())} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300"}`}>{d}</button>;
            })}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Times" hint="Comma-separated, 24h e.g. 10:00, 13:00"><Input value={e.inspection.times.join(", ")} onChange={(x) => setInsp("times", x.target.value.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)))} /></Field>
            <Field label="Seats per slot" hint="0 = unlimited (e.g. bus seats)"><Input type="number" min={0} value={e.inspection.capacityPerSlot ?? 0} onChange={(x) => setInsp("capacityPerSlot", Number(x.target.value))} /></Field>
            <Field label="Bookable days ahead"><Input type="number" min={1} max={90} value={e.inspection.daysAhead ?? 30} onChange={(x) => setInsp("daysAhead", Number(x.target.value))} /></Field>
            <Field label="Meeting point" className="sm:col-span-3"><Input value={e.inspection.meetingPoint ?? ""} onChange={(x) => setInsp("meetingPoint", x.target.value)} /></Field>
            <Field label="Transport notes" className="sm:col-span-3"><Input value={e.inspection.transportNotes ?? ""} onChange={(x) => setInsp("transportNotes", x.target.value)} placeholder="Free bus departs 30 minutes before each slot" /></Field>
          </div>
        </Card>
        {e._id && (
          <Card title="Products, prices & payment plans" actions={<Button size="sm" onClick={() => setProductModal("new")}>Add product</Button>}>
            {products.length === 0 ? <p className="text-sm text-gray-500">Add plot sizes or unit types with prices and installment plans.</p> : (
              <ul className="divide-y divide-gray-100">
                {products.map((p) => (
                  <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{p.name} {p.status === "sold_out" && <Badge>Sold out</Badge>} {p.promo?.price ? <Badge tone="amber">Promo {formatNaira(p.promo.price)}</Badge> : null}</p>
                      <p className="text-sm text-gray-500">{formatNaira(p.outrightPrice)} outright · {p.plans.length} plan{p.plans.length === 1 ? "" : "s"}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setProductModal(p)}>Edit</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {e._id && <Card title="Price change history"><PriceHistory estateId={e._id} /></Card>}
      </div>

      <div className="space-y-6">
        <Card title="Publishing">
          <Field label="Status"><Select value={e.status} onChange={(x) => set("status", x.target.value)}><option value="selling">Selling</option><option value="coming_soon">Coming soon</option><option value="sold_out">Sold out</option></Select></Field>
          <div className="mt-2"><Toggle checked={e.published} onChange={(v) => set("published", v)} label="Visible on realtor sites" description="Hide while you finish setting it up" /></div>
          <ErrorNote error={err} />
          <Button className="mt-3 w-full" onClick={save} loading={busy} disabled={!e.name}>{e._id ? "Save changes" : "Create estate"}</Button>
          {e._id && <Button variant="ghost" className="mt-2 w-full text-red-600" onClick={async () => { if (!window.confirm("Delete this estate? Only possible if no leads are attached.")) return; try { await api(`/estates/${e._id}`, { method: "DELETE" }); router.push("/app/estates"); } catch (er) { setErr(er); } }}>Delete estate</Button>}
        </Card>
        <Card title="Title documents">
          <div className="flex flex-wrap gap-2">
            {meta.documents.map((d) => {
              const on = e.documents.includes(d);
              return <button key={d} type="button" aria-pressed={on} onClick={() => set("documents", on ? e.documents.filter((x) => x !== d) : [...e.documents, d])} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-gray-300"}`}>{d}</button>;
            })}
          </div>
        </Card>
        <Card title="Amenities">
          <Textarea rows={4} value={e.amenities.join("\n")} onChange={(x) => set("amenities", x.target.value.split("\n"))} placeholder={"Gated & fenced\nGood road network\n24/7 security"} />
          <p className="mt-1 text-xs text-gray-500">One per line</p>
        </Card>
        <Card title="Commission rule">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rule"><Select value={e.commission?.type ?? ""} onChange={(x) => set("commission", x.target.value ? { type: x.target.value, value: e.commission?.value ?? 5 } : null)}><option value="">Firm default</option><option value="percent">%</option><option value="fixed">Fixed ₦</option></Select></Field>
            <Field label="Value"><Input inputMode="decimal" disabled={!e.commission?.type} value={e.commission?.value ?? ""} onChange={(x) => set("commission", { ...e.commission, value: Number(x.target.value) })} /></Field>
          </div>
        </Card>
        <Card title="Share caption">
          <Textarea rows={5} value={e.shareCaption ?? ""} onChange={(x) => set("shareCaption", x.target.value)} placeholder="Leave blank to use the firm default caption" />
          <p className="mt-1 text-xs text-gray-500">Placeholders: {"{estate} {location} {price} {realtor} {phone} {link}"}</p>
        </Card>
      </div>
      {productModal && e._id && <ProductModal estateId={e._id} product={productModal === "new" ? null : productModal} onClose={() => setProductModal(null)} onSaved={() => { void mutate(); toast("Prices saved — realtor sites updated"); }} />}
    </div>
  );
}
