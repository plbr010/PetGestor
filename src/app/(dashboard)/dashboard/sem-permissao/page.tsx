import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <>
      <DashboardHeader title="Acesso negado" description="permissões insuficientes" />
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Você não tem permissão para acessar esta área.</CardTitle>
            <CardDescription>
              Se precisar de acesso, peça ao administrador da empresa para ajustar suas
              permissões.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/dashboard" className="flex-1">
              Voltar ao início
            </ButtonLink>
            <ButtonLink href="/dashboard/agenda" variant="outline" className="flex-1">
              Ir para agenda
            </ButtonLink>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
