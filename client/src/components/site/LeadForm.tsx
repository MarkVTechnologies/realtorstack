"use client";

import { useId, useState } from "react";
import { postPublic } from "./visitor";

interface Props {
  firm: string;
  realtor: string;
  estate?: string;
  products?: { id: string; name: string }[];
  realtorName: string;
  whatsapp?: string;
  privacyHref: string;
  heading?: string;
  compact?: boolean;
}

/** LC-01: name, phone (required), email, interest, preferred contact time, message — with NDPA consent. */
export function LeadForm({ firm, realtor, estate, products = [], realtorName, whatsapp, privacyHref, heading = "Get prices & payment plans", compact }: Props) {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);
    try {
      await postPublic("/leads", {
        firm, realtor, estate,
        productId: (fd.get("productId") as string) || undefined,
        name: fd.get("name"),
        phone: fd.get("phone"),
        email: fd.get("email") || "",
        preferredContactTime: (fd.get("time") as string) || undefined,
        message: (fd.get("message") as string) || undefined,
        consent: fd.get("consent") === "on",
        website: fd.get("website") || undefined,
        path: window.location.pathname,
      });
      setStatus("done");
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="animate-fade-up rounded-3xl bg-brand-soft p-6 text-center" role="status">
        <span className="mx-auto mb-3 flex h-12 w-12 animate-pop items-center justify-center rounded-full bg-brand text-xl text-brand-ink">✓</span>
        <p className="text-lg font-semibold text-brand-strong">Thank you! {realtorName.split(" ")[0]} will contact you shortly.</p>
        <p className="mt-1 text-sm text-gray-700">Want a faster response? Send a WhatsApp message now.</p>
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.replace(/^\+/, "")}?text=${encodeURIComponent("Hello, I just sent an enquiry on your website.")}`} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 font-semibold text-white">
            Chat on WhatsApp
          </a>
        )}
      </div>
    );
  }

  const field = "mt-1.5 block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-base text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_25%,white)]";
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate={false}>
      {heading && <h3 className="text-lg font-bold tracking-tight text-gray-950">{heading}</h3>}
      <div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
        <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-name`}>
          Full name
          <input id={`${id}-name`} name="name" required minLength={2} autoComplete="name" className={field} placeholder="e.g. Funmi Lawal" />
        </label>
        <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-phone`}>
          Phone number
          <input id={`${id}-phone`} name="phone" required type="tel" inputMode="tel" autoComplete="tel" className={field} placeholder="0803 123 4567" />
        </label>
        <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-email`}>
          Email <span className="font-normal text-gray-500">(optional)</span>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" className={field} />
        </label>
        {products.length > 0 ? (
          <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-product`}>
            Interested in
            <select id={`${id}-product`} name="productId" className={field} defaultValue="">
              <option value="">Not sure yet</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-time`}>
            Best time to call
            <select id={`${id}-time`} name="time" className={field} defaultValue="">
              <option value="">Any time</option>
              <option>Morning (8am–12pm)</option>
              <option>Afternoon (12pm–4pm)</option>
              <option>Evening (4pm–8pm)</option>
            </select>
          </label>
        )}
      </div>
      {!compact && (
        <label className="block text-sm font-medium text-gray-800" htmlFor={`${id}-msg`}>
          Message <span className="font-normal text-gray-500">(optional)</span>
          <textarea id={`${id}-msg`} name="message" rows={3} className={field} placeholder="Which plot size and payment plan are you considering?" />
        </label>
      )}
      {/* Honeypot (LC-08): hidden from people, tempting for bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
        <span>
          I agree that {realtorName} may contact me about this enquiry. See the <a href={privacyHref} className="underline">privacy notice</a>.
        </span>
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={status === "sending"} className="w-full rounded-2xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-ink shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
        {status === "sending" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
