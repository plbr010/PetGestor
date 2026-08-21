import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

type SignUpPageProps = {
  searchParams: Promise<{ modo?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  await redirectIfAuthenticated();
  const params = await searchParams;
  const mode = params.modo === "funcionario" ? "staff" : "owner";

  return (
    <AuthShell>
      <SignUpForm mode={mode} />
    </AuthShell>
  );
}
