import Link from "next/link";
import { Plus } from "lucide-react";

import { getServicePackages } from "@/features/service-packages/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatCentsToBRL } from "@/lib/money";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PackagesPageProps = {
  searchParams: Promise<{ arquivado?: string }>;
};

export default async function ServicePackagesPage({ searchParams }: PackagesPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const packages = await getServicePackages({ companyId: context.membership.company.id });

  return (
    <>
      <DashboardHeader
        title="Pacotes"
        description="pacotes de serviços oferecidos pelo pet shop"
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Pacote arquivado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <ButtonLink href="/dashboard/servicos" variant="outline">
            Voltar aos serviços
          </ButtonLink>
          <ButtonLink href="/dashboard/servicos/pacotes/novo">
            <Plus className="size-4" aria-hidden="true" />
            Novo pacote
          </ButtonLink>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pacotes cadastrados</CardTitle>
            <CardDescription>
              Combine serviços com quantidade e validade para vender ao tutor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {packages.length === 0 ? (
              <EmptyState
                title="Nenhum pacote cadastrado"
                description="Crie o primeiro pacote para vender banhos, tosas ou combos."
              />
            ) : (
              <ul className="divide-y rounded-xl border">
                {packages.map((pkg) => (
                  <li key={pkg.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{pkg.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCentsToBRL(pkg.price_cents)} · {pkg.validity_days} dias ·{" "}
                        {pkg.itemCount} serviço{pkg.itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={pkg.active ? "default" : "secondary"}>
                        {pkg.active ? "Ativo" : "Inativo"}
                      </Badge>
                      <Link
                        href={`/dashboard/servicos/pacotes/${pkg.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Ver detalhes
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
