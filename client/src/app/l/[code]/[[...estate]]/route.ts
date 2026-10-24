import { NextResponse, type NextRequest } from "next/server";
import { siteBase, siteOrigin } from "@/lib/urls";

const API = process.env.API_URL ?? "http://localhost:4000";
const VISITOR_COOKIE = "rs_vid";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";

function newVisitorId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Short share link (SD-01): /l/{code}/{estate}?c={channel}
 * Records the click server-side — so attribution survives blocked cookies (§9.4) — then
 * redirects to the realtor's property page carrying the channel for UTM-style tracking.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/l/[code]/[[...estate]]">) {
  const { code, estate } = await ctx.params;
  const estateSlug = estate?.[0];
  const channel = req.nextUrl.searchParams.get("c") ?? req.nextUrl.searchParams.get("utm_source") ?? undefined;
  const vid = req.cookies.get(VISITOR_COOKIE)?.value ?? newVisitorId();

  let target = "/";
  try {
    const res = await fetch(`${API}/api/public/shortlink`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": req.headers.get("user-agent") ?? "",
        "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify({ code, estate: estateSlug, vid, channel }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { firm: string; realtor: string; estate: string | null };
      const path = data.estate ? `/estates/${data.estate}` : "";
      const query = channel ? `?c=${encodeURIComponent(channel)}` : "";
      target = ROOT_DOMAIN ? `${siteOrigin(data.firm, data.realtor)}${path}${query}` : `${siteBase(data.firm, data.realtor)}${path || "/"}${query}`;
    }
  } catch {
    // API unreachable: fall back to the home page rather than an error
  }

  const response = NextResponse.redirect(new URL(target, req.url), 302);
  response.cookies.set(VISITOR_COOKIE, vid, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", secure: req.nextUrl.protocol === "https:" });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
