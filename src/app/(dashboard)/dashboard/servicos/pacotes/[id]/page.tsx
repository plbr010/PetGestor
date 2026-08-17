import { ArchiveServicePackageButton } from "@/features/service-packages/components/archive-service-package-button";
import { ToggleServicePackageActiveButton } from "@/features/service-packages/components/toggle-service-package-active-button";
import { requireServicePackageById } from "@/features/service-packages/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatCentsToBRL } from "@/lib/money";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PackageDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function ServicePackageDetailPage({
  params,
  searchParams,
}: PackageDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const pkg = await requireServicePackageById(context.membership.company.id, id);

  return (
    <>
      <DashboardHeader title={pkg.name} description="detalhes do pacote" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Pacote atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/servicos/pacotes/${id}/editar`} variant="outline">
              Editar pacote
            </ButtonLink>
            <ToggleServicePackageActiveButton packageId={id} active={pkg.active} />
          </div>
          <ArchiveServicePackageButton packageId={id} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Resumo</CardTitle>
            <Badge variant={pkg.active ? "default" : "secondary"}>
              {pkg.active ? "Ativo" : "Inativo"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Preço" value={formatCentsToBRL(pkg.price_cents)} />
            <Row label="Validade" value={`${pkg.validity_days} dias`} />
            {pkg.description ? (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-muted-foreground">Descrição</p>
                <p className="mt-1 whitespace-pre-wrap">{pkg.description}</p>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-muted-foreground">Itens incluídos</p>
              <ul className="space-y-1">
                {pkg.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}x {item.service_name}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
