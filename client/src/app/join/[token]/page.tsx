import { Suspense } from "react";
import type { Metadata } from "next";
import { JoinFlow } from "./JoinFlow";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false } };

export default function JoinPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JoinFlow />
    </Suspense>
  );
}
