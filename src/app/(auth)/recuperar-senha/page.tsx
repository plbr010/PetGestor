import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default async function PasswordRecoveryPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <PasswordRecoveryForm />
    </AuthShell>
  );
}
