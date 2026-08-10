import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthErrorPageProps = {
  searchParams: Promise<{
    motivo?: string;
  }>;
};

const messages: Record<string, string> = {
  "confirmacao-invalida":
    "O link de confirmação está incompleto ou expirou. Solicite um novo cadastro ou entre em contato com o suporte.",
  "confirmacao-falhou":
    "Não foi possível confirmar seu e-mail. O link pode ter expirado ou já foi utilizado.",
  "callback-falhou":
    "Não foi possível concluir a autenticação. Tente novamente a partir do e-mail recebido.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { motivo } = await searchParams;
  const message =
    (motivo && messages[motivo]) ??
    "Ocorreu um problema durante a autenticação. Tente novamente.";

  return (
    <AuthShell>
      <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center sm:text-left">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 sm:mx-0">
            <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">Não foi possível continuar</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 pt-6">
          <ButtonLink href="/entrar" className="w-full">
            Ir para o login
          </ButtonLink>
          <p className="text-center text-sm text-muted-foreground">
            Precisa de uma nova conta?{" "}
            <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
              Cadastre-se
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
