import type { Metadata } from "next";

import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { technicalAuthRobots } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  robots: technicalAuthRobots,
};

export default async function PasswordRecoveryPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <PasswordRecoveryForm />
    </AuthShell>
  );
}
