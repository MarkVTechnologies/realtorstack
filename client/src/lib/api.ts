"use client";

import useSWR, { type SWRConfiguration } from "swr";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

/** Same-origin call to the Express API (proxied by next.config rewrites; auth via httpOnly cookie). */
export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    credentials: "same-origin",
    headers: opts.form ? undefined : opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  const isJson = res.headers.get("content-type")?.includes("json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`, (data as { details?: unknown })?.details);
  return data as T;
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api<T>(p), { revalidateOnFocus: true, ...config });
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

/** Upload an image through the media pipeline (auto WebP variants). */
export async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<{ url: string; variants: Record<string, string>; width: number; height: number }>("/uploads/image", { form });
}

export async function uploadDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<{ url: string }>("/uploads/document", { form });
}
