import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default async function SignUpPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <SignUpForm />
    </AuthShell>
  );
}
