import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

/** The dashboard is a client-rendered app; the static shell is just the loading state. */
export default function DashboardLayout({ children }: LayoutProps<"/app">) {
  return (
    <Suspense fallback={<Loading label="Loading your workspace…" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
