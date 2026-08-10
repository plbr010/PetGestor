import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams: Promise<{
    "senha-atualizada"?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectIfAuthenticated();
  const params = await searchParams;
  const passwordUpdated = params["senha-atualizada"] === "1";

  return (
    <AuthShell>
      {passwordUpdated ? (
        <div
          className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
          role="status"
        >
          Senha atualizada com sucesso. Faça login com sua nova senha.
        </div>
      ) : null}
      <LoginForm />
    </AuthShell>
  );
}
