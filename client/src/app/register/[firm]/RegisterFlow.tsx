"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, useApi } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button, ErrorNote, Field, Input, Loading } from "@/components/ui";

/** RM-02: recruits self-register via the firm's shareable link / QR (pending admin approval). */
export function RegisterFlow() {
  const { firm } = useParams<{ firm: string }>();
  const regCode = useSearchParams().get("code") ?? "";
  const { data, error } = useApi<{ firm: { name: string; logoUrl?: string; brand?: { primaryColor?: string }; requireApproval: boolean } }>(`/auth/register/${firm}?code=${encodeURIComponent(regCode)}`, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [form, setForm] = useState({ name: "", phone: "", email: "", whatsapp: "" });
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (error) return <AuthCard title="Link not valid"><p className="text-sm text-gray-600">{(error as Error).message}</p></AuthCard>;
  if (!data) return <Loading />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthCard firmName={data.firm.name} logo={data.firm.logoUrl} brand={data.firm.brand?.primaryColor}
      title={`Become a ${data.firm.name} realtor`}
      subtitle="Get your own property website with every estate, price and payment plan — and get credited for every lead you bring.">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        (async () => {
          if (!sent) {
            const r = await api<{ devCode?: string }>(`/auth/register/${firm}/otp`, { body: { code: regCode, phone: form.phone } });
            setSent(true);
            setDevCode(r.devCode ?? null);
          } else {
            await api(`/auth/register/${firm}`, { body: { code: regCode, otp, ...form } });
            window.location.href = "/app";
          }
        })().catch(setErr).finally(() => setBusy(false));
      }}>
        <Field label="Full name"><Input value={form.name} onChange={set("name")} required minLength={2} autoComplete="name" disabled={sent} /></Field>
        <Field label="Phone number"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" required autoComplete="tel" disabled={sent} /></Field>
        <Field label="Email (optional)"><Input value={form.email} onChange={set("email")} type="email" autoComplete="email" disabled={sent} /></Field>
        <Field label="WhatsApp number" hint="Leave blank if same as phone."><Input value={form.whatsapp} onChange={set("whatsapp")} type="tel" inputMode="tel" disabled={sent} /></Field>
        {sent && <Field label="Verification code"><Input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} required autoFocus autoComplete="one-time-code" /></Field>}
        {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Development mode — your code is <strong>{devCode}</strong></p>}
        <p className="text-xs text-gray-500">Attribution rule: the realtor whose link a buyer first uses gets credit, if they buy within the firm&apos;s attribution window. Every decision is logged and visible to you.</p>
        {data.firm.requireApproval && <p className="text-xs text-gray-500">Your account will be reviewed by {data.firm.name} before your site goes live.</p>}
        <ErrorNote error={err} />
        <Button type="submit" loading={busy} className="w-full">{sent ? "Create my account" : "Verify phone number"}</Button>
      </form>
    </AuthCard>
  );
}
