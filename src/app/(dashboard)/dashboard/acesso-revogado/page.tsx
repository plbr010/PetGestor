import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccessRevokedPage() {
  return (
    <>
      <DashboardHeader title="Acesso removido" description="conta sem acesso à empresa" />
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Seu acesso a esta empresa foi removido.</CardTitle>
            <CardDescription>
              Entre em contato com o administrador se acredita que isso é um engano. Seu histórico
              de atendimentos foi preservado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ButtonLink href="/login" variant="outline">
              Sair e entrar com outra conta
            </ButtonLink>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
