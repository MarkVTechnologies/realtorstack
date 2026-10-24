"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, ErrorNote, Input, useToast } from "@/components/ui";

export function PasswordForm() {
  const { session } = useSession();
  const toast = useToast();
  const [err, setErr] = useState<unknown>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setErr(null);
      try { await api("/auth/password", { body: { currentPassword: fd.get("current") || undefined, newPassword: fd.get("new") } }); form.reset(); toast("Password updated"); } catch (er) { setErr(er); }
    }}>
      <p className="text-sm font-medium">{session.user.hasPassword ? "Change password" : "Set a password (optional — you can always sign in with OTP)"}</p>
      {session.user.hasPassword && <Input name="current" type="password" placeholder="Current password" autoComplete="current-password" />}
      <Input name="new" type="password" minLength={8} required placeholder="New password (8+ characters)" autoComplete="new-password" />
      <ErrorNote error={err} />
      <Button type="submit" variant="secondary" size="sm">Save password</Button>
    </form>
  );
}
