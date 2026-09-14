import type { Metadata } from "next";

import { requireRecoverySession } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { technicalAuthRobots } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  robots: technicalAuthRobots,
};

export default async function NewPasswordPage() {
  await requireRecoverySession();

  return (
    <AuthShell>
      <NewPasswordForm />
    </AuthShell>
  );
}
