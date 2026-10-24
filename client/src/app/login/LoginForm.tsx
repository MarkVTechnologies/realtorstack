"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, ErrorNote, Field, Input, Tabs } from "@/components/ui";

type Account = { id: string; role: string; firm: string };

export function LoginForm() {
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ token: string; list: Account[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const done = () => {
    window.location.href = next && next.startsWith("/app") ? next : "/app";
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Tabs value={mode} onChange={(m) => { setMode(m); setError(null); }} tabs={[{ value: "phone", label: "Phone (OTP)" }, { value: "email", label: "Email & password" }]} />

      {mode === "email" && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void run(async () => { await api("/auth/login", { body: { email: fd.get("email"), password: fd.get("password") } }); done(); });
        }}>
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
          <ErrorNote error={error} />
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        </form>
      )}

      {mode === "phone" && !accounts && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (!codeSent) {
              const r = await api<{ devCode?: string }>("/auth/otp/request", { body: { phone } });
              setCodeSent(true);
              setDevCode(r.devCode ?? null);
              return;
            }
            const r = await api<{ ok?: boolean; chooseAccount?: boolean; selectionToken?: string; accounts?: Account[] }>("/auth/otp/verify", { body: { phone, code } });
            if (r.chooseAccount) setAccounts({ token: r.selectionToken!, list: r.accounts! });
            else done();
          });
        }}>
          <Field label="Phone number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" required placeholder="0803 123 4567" autoComplete="tel" disabled={codeSent} /></Field>
          {codeSent && (
            <Field label="Verification code" hint="We sent a 6-digit code by SMS.">
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
            </Field>
          )}
          {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Development mode — your code is <strong>{devCode}</strong></p>}
          <ErrorNote error={error} />
          <Button type="submit" loading={busy} className="w-full">{codeSent ? "Verify & sign in" : "Send code"}</Button>
          {codeSent && <button type="button" className="w-full text-sm text-gray-500 underline" onClick={() => { setCodeSent(false); setCode(""); setDevCode(null); }}>Use a different number</button>}
        </form>
      )}

      {accounts && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Your number is linked to more than one firm. Which workspace do you want to open?</p>
          {accounts.list.map((a) => (
            <button key={a.id} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-emerald-700"
              onClick={() => void run(async () => { await api("/auth/otp/verify", { body: { phone, selectionToken: accounts.token, accountId: a.id } }); done(); })}>
              <span className="font-medium">{a.firm}</span><span className="text-xs capitalize text-gray-500">{a.role.replace("_", " ")}</span>
            </button>
          ))}
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
