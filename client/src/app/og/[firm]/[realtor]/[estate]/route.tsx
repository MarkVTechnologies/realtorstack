import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getEstate, getRealtor } from "@/lib/site-data";
import { formatNairaShort, locationLine } from "@/lib/format";

const API = process.env.API_URL ?? "http://localhost:4000";

// Inter (OFL). The latin-ext subset carries the ₦ glyph, which the default OG font lacks.
const FONT_DIR = path.join(process.cwd(), "src/app/og/fonts");
const fontsPromise = Promise.all(
  (["latin", "latin-ext"] as const).flatMap((subset) =>
    ([400, 800] as const).map(async (weight) => ({
      name: subset === "latin" ? "Inter" : "InterExt",
      weight,
      style: "normal" as const,
      data: await readFile(path.join(FONT_DIR, `inter-${subset}-${weight}-normal.woff`)),
    })),
  ),
);

/**
 * The OG renderer refuses image URLs on private addresses (SSRF protection), and our media
 * lives behind the API — so fetch the JPEG ourselves and inline it.
 */
async function photoDataUri(url?: string) {
  if (!url) return null;
  try {
    const res = await fetch(`${API}${url.replace(/^https?:\/\/[^/]+/, "")}`);
    if (!res.ok) return null;
    return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Open Graph card for WhatsApp / Facebook / X / LinkedIn previews (SD-02):
 * estate photo, name, price and the realtor's name, in the firm's colours.
 */
export async function GET(_req: Request, ctx: RouteContext<"/og/[firm]/[realtor]/[estate]">) {
  const { firm, realtor, estate } = await ctx.params;
  const [e, r] = await Promise.all([getEstate(firm, estate), getRealtor(firm, realtor)]);
  if (!e || !r) return new Response("Not found", { status: 404 });

  const brand = e.firm.brand?.primaryColor ?? "#0f5132";
  const accent = e.firm.brand?.accentColor ?? "#c9a227";
  const cover = e.estate.media.images?.[0];
  const photo = await photoDataUri(cover?.variants?.og);
  const from = e.estate.products.length ? Math.min(...e.estate.products.map((p) => p.price)) : null;
  const who = r.house ? e.firm.name : r.realtor.name;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: brand, fontFamily: "Inter, InterExt" }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.15) 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", width: "100%", color: "white" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 14, height: 48, background: accent, borderRadius: 4 }} />
            <div style={{ fontSize: 30, fontWeight: 700 }}>{e.firm.name}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>{e.estate.name}</div>
            <div style={{ fontSize: 32, marginTop: 12, opacity: 0.9 }}>{locationLine(e.estate.location)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 28 }}>
              <div style={{ fontSize: 30, opacity: 0.85 }}>From</div>
              <div style={{ fontSize: 64, fontWeight: 800, color: accent }}>{formatNairaShort(from)}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 600, background: "rgba(255,255,255,0.16)", padding: "10px 22px", borderRadius: 999 }}>
              {r.house ? "Talk to our sales team" : `Contact ${who}`}
            </div>
            <div style={{ fontSize: 26, opacity: 0.85 }}>{e.estate.documents.slice(0, 2).join(" · ")}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await fontsPromise, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
