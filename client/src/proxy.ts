import { NextResponse, type NextRequest } from "next/server";

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
const SHORT_DOMAIN = (process.env.SHORT_DOMAIN ?? "").toLowerCase();
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api"]);
export const VISITOR_COOKIE = "rs_vid";

function newVisitorId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Multi-tenant routing (§11.2):
 *   {realtor}.{firm}.ROOT_DOMAIN/...  → /s/{firm}/{realtor}/...
 *   {firm}.ROOT_DOMAIN/...            → /s/{firm}/main/...   (firm's own "House" site)
 *   SHORT_DOMAIN/{code}/{estate}      → /l/{code}/{estate}   (short share links)
 * Without ROOT_DOMAIN (local dev) the path-based URLs are used directly.
 *
 * Also issues the first-party visitor cookie used for attribution (§9.2).
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname, search } = req.nextUrl;
  let res: NextResponse | undefined;

  if (SHORT_DOMAIN && host === SHORT_DOMAIN && !pathname.startsWith("/l/")) {
    res = NextResponse.rewrite(new URL(`/l${pathname}${search}`, req.url));
  } else if (ROOT_DOMAIN && host.endsWith(`.${ROOT_DOMAIN}`)) {
    const parts = host.slice(0, -(ROOT_DOMAIN.length + 1)).split(".");
    let target: string | null = null;
    if (parts.length === 1 && !RESERVED_SUBDOMAINS.has(parts[0])) target = `/s/${parts[0]}/main`;
    if (parts.length === 2) target = `/s/${parts[1]}/${parts[0]}`;
    if (target && !pathname.startsWith("/s/")) {
      res = NextResponse.rewrite(new URL(`${target}${pathname === "/" ? "" : pathname}${search}`, req.url));
    }
  }

  // Optimistic auth check for the dashboard; the API enforces real authorization.
  if (!res && pathname.startsWith("/app") && !req.cookies.get("rs_token")) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  res ??= NextResponse.next();
  const isSite = pathname.startsWith("/s/") || res.headers.get("x-middleware-rewrite")?.includes("/s/");
  if (isSite && !req.cookies.get(VISITOR_COOKIE)) {
    res.cookies.set(VISITOR_COOKIE, newVisitorId(), { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", secure: req.nextUrl.protocol === "https:" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
