import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpWizard } from "@/components/auth/sign-up-wizard";
import { brand } from "@/config/brand";
import { formatTrialCtaLabel, formatTrialNote } from "@/config/subscription";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta",
  description: `${formatTrialCtaLabel()} no ${brand.name}. ${formatTrialNote()}`,
};

type SignUpPageProps = {
  searchParams: Promise<{ modo?: string; email?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  await redirectIfAuthenticated();
  const params = await searchParams;

  const initialStep =
    params.modo === "funcionario"
      ? "staff-email"
      : params.modo === "dono"
        ? "owner-form"
        : "choice";

  return (
    <AuthShell>
      <SignUpWizard
        initialStep={initialStep}
        initialEmail={typeof params.email === "string" ? params.email : ""}
      />
    </AuthShell>
  );
}
