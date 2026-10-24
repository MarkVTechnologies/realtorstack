"use client";

import { useEffect } from "react";
import { getChannel, getVisitorId } from "./visitor";

/**
 * Page-view beacon (RS-05): every page carries the realtor's attribution token, so the visit is
 * recorded against them. Uses sendBeacon so it never delays rendering on slow 3G connections.
 */
export function SiteTracker({ firm, realtor, estate }: { firm: string; realtor: string; estate?: string }) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const payload = JSON.stringify({
      firm,
      realtor,
      estate,
      vid: getVisitorId(),
      channel: getChannel(),
      utm: { source: q.get("utm_source") ?? undefined, medium: q.get("utm_medium") ?? undefined, campaign: q.get("utm_campaign") ?? undefined },
      path: window.location.pathname,
    });
    try {
      if (navigator.sendBeacon?.("/api/public/touch", new Blob([payload], { type: "text/plain" }))) return;
    } catch {
      /* fall through */
    }
    fetch("/api/public/touch", { method: "POST", body: payload, headers: { "content-type": "text/plain" }, keepalive: true }).catch(() => {});
  }, [firm, realtor, estate]);
  return null;
}
