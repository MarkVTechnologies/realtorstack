import { connection } from "next/server";
import { getSitemap } from "@/lib/site-data";
import { siteOrigin } from "@/lib/urls";

/** RS-07: sitemap for a realtor site (the firm "main" site lists every realtor too). */
export async function GET(_req: Request, ctx: RouteContext<"/s/[firm]/[realtor]/sitemap.xml">) {
  await connection(); // per-firm, generated on request (then cached via getSitemap)
  const { firm, realtor } = await ctx.params;
  const data = await getSitemap(firm);
  if (!data) return new Response("Not found", { status: 404 });
  const origin = siteOrigin(firm, realtor);
  const urls = [
    { loc: origin },
    { loc: `${origin}/estates` },
    ...data.estates.map((e) => ({ loc: `${origin}/estates/${e.slug}`, lastmod: e.updatedAt })),
    { loc: `${origin}/about` },
    { loc: `${origin}/contact` },
    ...(realtor === "main" ? data.realtors.map((r) => ({ loc: siteOrigin(firm, r.slug), lastmod: r.updatedAt })) : []),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc>${"lastmod" in u && u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
}
