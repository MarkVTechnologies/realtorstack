"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, QrCode } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { api, useApi } from "@/lib/api";
import { formatNairaShort } from "@/lib/format";
import { Button, Card, Empty, Loading, Modal, PageHeader, StatusBadge, useCopy } from "@/components/ui";

interface Kit {
  siteUrl: string; siteShortLink: string; code: string;
  estates: { id: string; name: string; slug: string; status: string; image: string | null; fromPrice: number | null; link: string; links: Record<string, string>; pageUrl: string; caption: string }[];
}

const track = (estateId: string | undefined, channel: string, action = "share") => api("/realtors/me/share-event", { body: { estateId, channel, action } }).catch(() => {});

/** SD-01 / SD-03 / SD-05: one-tap share to WhatsApp, copy caption, QR codes. Flow 12.2 lands here. */
export default function SharePage() {
  const { data } = useApi<Kit>("/realtors/me/share-kit");
  const copy = useCopy();
  const welcome = useSearchParams().get("welcome");
  const [qr, setQr] = useState<{ title: string; url: string } | null>(null);
  if (!data) return <Loading />;

  const shareNative = async (title: string, text: string, url: string, estateId?: string) => {
    if (navigator.share) {
      try { await navigator.share({ title, text }); void track(estateId, "other"); } catch { /* cancelled */ }
    } else {
      await copy(text, "Caption copied");
      void track(estateId, "other", "copy_caption");
    }
    void url;
  };

  return (
    <>
      <PageHeader title={welcome ? "Your site is live 🎉" : "Share & links"} description="Every link carries your realtor code, so every lead it brings is credited to you." />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => setQr({ title: "Your website", url: data.siteShortLink })} className="rounded-lg border bg-white p-2" aria-label="Show QR code for your website"><QRCodeSVG value={data.siteShortLink} size={88} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">Your website · code <span className="font-mono">{data.code}</span></p>
            <a href={data.siteUrl} target="_blank" rel="noopener" className="block truncate font-semibold text-emerald-800 hover:underline">{data.siteUrl}</a>
            <p className="truncate text-sm text-gray-500">Short link: {data.siteShortLink}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { void copy(data.siteShortLink, "Link copied"); void track(undefined, "direct", "copy_link"); }}><Copy className="h-4 w-4" /> Copy link</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`See all my available properties: ${data.siteShortLink}?c=whatsapp`)}`} target="_blank" rel="noopener" onClick={() => void track(undefined, "whatsapp")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"><FaWhatsapp className="h-4 w-4" /> Share to WhatsApp</a>
          </div>
        </div>
      </Card>

      {data.estates.length === 0 ? <Card><Empty title="No estates to share yet" description="Your firm hasn't published any estates." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.estates.map((e) => (
            <Card key={e.id} padded={false}>
              <div className="flex gap-3 p-4">
                {e.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : <div className="h-20 w-24 shrink-0 rounded-lg bg-gradient-to-br from-emerald-700 to-amber-500" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><h2 className="font-semibold text-gray-900">{e.name}</h2><StatusBadge status={e.status} /></div>
                  <p className="text-sm text-gray-500">From {formatNairaShort(e.fromPrice)}</p>
                  <p className="truncate font-mono text-xs text-gray-500">{e.link}</p>
                </div>
              </div>
              <div className="mx-4 rounded-lg bg-gray-50 p-3 text-sm whitespace-pre-line text-gray-800">{e.caption}</div>
              <div className="flex flex-wrap gap-2 p-4">
                <a href={`https://wa.me/?text=${encodeURIComponent(e.caption.replace(e.link, e.links.whatsapp))}`} target="_blank" rel="noopener" onClick={() => void track(e.id, "whatsapp")}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"><FaWhatsapp className="h-4 w-4" /> WhatsApp / Status</a>
                <Button variant="secondary" size="sm" onClick={() => { void copy(e.caption.replace(e.link, e.links.instagram), "Caption copied — paste in Instagram"); void track(e.id, "instagram", "copy_caption"); }}><Copy className="h-4 w-4" /> Caption</Button>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(e.links.facebook)}`} target="_blank" rel="noopener" onClick={() => void track(e.id, "facebook")} className="inline-flex items-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium">Facebook</a>
                <Button variant="secondary" size="sm" onClick={() => setQr({ title: e.name, url: e.links.qr })} aria-label={`QR code for ${e.name}`}><QrCode className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => void shareNative(e.name, e.caption, e.link, e.id)}>More…</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!qr} onClose={() => setQr(null)} title={`QR code · ${qr?.title ?? ""}`}>
        {qr && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl border bg-white p-4"><QRCodeSVG value={qr.url} size={240} /></div>
            <p className="text-center text-sm text-gray-600">For printed flyers and site signage. Scans are tracked as the &quot;QR&quot; channel.</p>
            <a href={`/api/realtors/qr?format=png&download=1&text=${encodeURIComponent(qr.url)}`} onClick={() => void track(undefined, "qr", "download_qr")} className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4" /> Download PNG</a>
          </div>
        )}
      </Modal>
    </>
  );
}
