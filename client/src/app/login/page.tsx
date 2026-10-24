import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { AuthCard } from "@/components/app/AuthCard";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" subtitle="Realtors can sign in with their phone number. Firm staff use email and password.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
