"use client";

/** Reads the first-party visitor id issued by the proxy (rs_vid). */
export function getVisitorId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = /(?:^|;\s*)rs_vid=([^;]+)/.exec(document.cookie);
  return m?.[1];
}

const CHANNELS = new Set(["whatsapp", "instagram", "facebook", "x", "linkedin", "tiktok", "qr", "sms", "email", "direct", "other"]);

/** Channel from ?c= (our share buttons) or utm_source, remembered for the session. */
export function getChannel(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const q = new URLSearchParams(window.location.search);
  const raw = (q.get("c") ?? q.get("utm_source") ?? "").toLowerCase();
  const fromUrl = raw === "ig" ? "instagram" : raw === "fb" ? "facebook" : raw === "wa" ? "whatsapp" : raw;
  try {
    if (fromUrl && CHANNELS.has(fromUrl)) sessionStorage.setItem("rs_ch", fromUrl);
    return sessionStorage.getItem("rs_ch") ?? undefined;
  } catch {
    return CHANNELS.has(fromUrl) ? fromUrl : undefined;
  }
}

export async function postPublic<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vid: getVisitorId(), channel: getChannel(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Please try again.");
  return data as T;
}
