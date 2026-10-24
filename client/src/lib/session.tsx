"use client";

import { createContext, useContext } from "react";

export interface Session {
  user: { id: string; name: string; email?: string; phone?: string; role: string; status: string; hasPassword: boolean; notificationPrefs?: { email: boolean; inApp: boolean } };
  tenant: { id: string; name: string; slug: string; logoUrl?: string; brand?: { primaryColor?: string; accentColor?: string }; status: string; plan: string; manualLeads?: string } | null;
  realtor: { code: string; slug: string; shortCode: string; siteUrl: string; photoUrl?: string; whatsapp?: string } | null;
  capabilities: string[];
}

export const SessionContext = createContext<{ session: Session; refresh: () => void } | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the dashboard");
  return ctx;
}

export function useCan() {
  const { session } = useSession();
  return (cap: string) => session.capabilities.includes(cap);
}
