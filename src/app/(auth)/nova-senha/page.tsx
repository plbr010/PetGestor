import { requireRecoverySession } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/new-password-form";

export default async function NewPasswordPage() {
  await requireRecoverySession();

  return (
    <AuthShell>
      <NewPasswordForm />
    </AuthShell>
  );
}
