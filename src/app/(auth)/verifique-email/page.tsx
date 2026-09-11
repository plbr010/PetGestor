import Link from "next/link";
import { Mail } from "lucide-react";

import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VerifyEmailPageProps = {
  searchParams: Promise<{ modo?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  await redirectIfAuthenticated();
  const params = await searchParams;
  const isStaff = params.modo === "funcionario";

  return (
    <AuthShell>
      <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center sm:text-left">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 sm:mx-0">
            <Mail className="size-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">Verifique seu e-mail</CardTitle>
          <CardDescription>
            {isStaff
              ? "Se a confirmação estiver habilitada, enviamos um link. Depois de confirmar, o convite da empresa aparece em /convite — nenhuma empresa nova será criada."
              : "Se a confirmação de e-mail estiver habilitada, enviamos um link para o endereço informado no cadastro. Abra o e-mail e clique no link para ativar sua conta."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Não encontrou o e-mail? Verifique a pasta de spam ou lixo eletrônico.</p>
          <ResendConfirmationForm />
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 pt-6">
          <ButtonLink href="/entrar" className="w-full">
            Voltar para o login
          </ButtonLink>
          <p className="text-center text-sm text-muted-foreground">
            {isStaff ? (
              <>
                Já confirmou?{" "}
                <Link
                  href="/entrar"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Entrar e aceitar o convite
                </Link>
              </>
            ) : (
              <>
                Cadastrou-se por engano?{" "}
                <Link
                  href="/cadastro"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Criar outra conta
                </Link>
              </>
            )}
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
