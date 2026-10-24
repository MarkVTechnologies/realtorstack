"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api, useApi } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { AuthCard } from "@/components/app/AuthCard";
import { Button, ErrorNote, Field, Input, Loading } from "@/components/ui";

interface InviteInfo { firm: { name: string; logoUrl?: string; brand?: { primaryColor?: string } }; user: { name: string; phone?: string; email?: string; role: string } }

/** Flow 12.2: open invite → verify phone with OTP → add WhatsApp → "your site is live". */
export function JoinFlow() {
  const { token } = useParams<{ token: string }>();
  const { data, error } = useApi<InviteInfo>(`/auth/invite/${token}`, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (error) return <AuthCard title="Invite not valid"><p className="text-sm text-gray-600">{(error as Error).message}. Ask your firm to resend your invite.</p></AuthCard>;
  if (!data) return <Loading />;
  const isRealtor = data.user.role === "realtor";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <AuthCard firmName={data.firm.name} logo={data.firm.logoUrl} brand={data.firm.brand?.primaryColor}
      title={`Welcome, ${data.user.name.split(" ")[0]}`}
      subtitle={isRealtor ? `${data.firm.name} has created a sales website for you. Verify your phone number to activate it.` : `You've been invited to ${data.firm.name} on RealtorStack. Choose a password to continue.`}>
      {isRealtor ? (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void run(async () => {
            const number = phone || data.user.phone || "";
            if (!sent) {
              const r = await api<{ devCode?: string }>(`/auth/invite/${token}/otp`, { body: { phone: number } });
              setSent(true);
              setDevCode(r.devCode ?? null);
              return;
            }
            await api(`/auth/invite/${token}/accept`, { body: { phone: number, code, whatsapp: fd.get("whatsapp") || undefined } });
            window.location.href = "/app/share?welcome=1";
          });
        }}>
          <Field label="Phone number"><Input type="tel" inputMode="tel" required defaultValue={formatPhone(data.user.phone)} onChange={(e) => setPhone(e.target.value)} disabled={sent} /></Field>
          {sent && (
            <>
              <Field label="Verification code" hint="Enter the 6-digit code we sent by SMS."><Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required autoFocus autoComplete="one-time-code" /></Field>
              <Field label="WhatsApp number" hint="Leave blank if it's the same as your phone. Buyers will message you here."><Input name="whatsapp" type="tel" inputMode="tel" /></Field>
            </>
          )}
          {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Development mode — your code is <strong>{devCode}</strong></p>}
          <ErrorNote error={err} />
          <Button type="submit" loading={busy} className="w-full">{sent ? "Activate my site" : "Send verification code"}</Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (fd.get("password") !== fd.get("confirm")) return setErr(new Error("Passwords do not match"));
          void run(async () => {
            await api(`/auth/invite/${token}/accept`, { body: { password: fd.get("password") } });
            window.location.href = "/app";
          });
        }}>
          <Field label="Email"><Input value={data.user.email ?? ""} disabled /></Field>
          <Field label="Password" hint="At least 8 characters."><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Confirm password"><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <ErrorNote error={err} />
          <Button type="submit" loading={busy} className="w-full">Accept invite</Button>
        </form>
      )}
    </AuthCard>
  );
}
