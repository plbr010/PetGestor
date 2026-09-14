import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { brand } from "@/config/brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar",
  description: `Acesse sua conta do ${brand.name} para gerenciar agenda, tutores, pets e o dia a dia do pet shop.`,
};

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
