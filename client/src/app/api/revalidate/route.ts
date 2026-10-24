import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

/**
 * Called by the API after content changes (PC-04: price updates propagate instantly to all
 * realtor sites). `expire: 0` makes the next visitor get fresh data instead of a stale page.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 50) : [];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
