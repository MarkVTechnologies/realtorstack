import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterFlow } from "./RegisterFlow";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Join as a realtor", robots: { index: false } };

export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterFlow />
    </Suspense>
  );
}
