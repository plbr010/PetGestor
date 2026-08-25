import { ArchiveServiceButton } from "@/features/services/components/archive-service-button";
import { ToggleServiceActiveButton } from "@/features/services/components/toggle-service-active-button";
import { getServiceRecipes } from "@/features/services/recipe-queries";
import { requireServiceById } from "@/features/services/queries";
import {
  formatDurationLabel,
  formatServiceDurationSummary,
  formatServicePriceSummary,
  PET_SIZE_LABELS,
  PRICING_MODE_LABELS,
} from "@/features/services/utils";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatCentsToBRL } from "@/lib/money";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ServiceDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function ServiceDetailPage({
  params,
  searchParams,
}: ServiceDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const companyId = context.membership.company.id;
  const [service, recipes] = await Promise.all([
    requireServiceById(companyId, id),
    getServiceRecipes(companyId, id),
  ]);

  return (
    <>
      <DashboardHeader title={service.name} description="detalhes do serviço" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Serviço atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/servicos/${id}/editar`} variant="outline">
              Editar
            </ButtonLink>
            <ToggleServiceActiveButton serviceId={id} active={service.active} />
          </div>
          <ArchiveServiceButton serviceId={id} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={service.active ? "default" : "secondary"}>
                  {service.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Modelo de preço</span>
                <span className="font-medium">{PRICING_MODE_LABELS[service.pricing_mode]}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Preço</span>
                <span className="font-medium">
                  {formatServicePriceSummary(
                    service.pricing_mode,
                    service.price_cents,
                    service.sizePrices,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Duração</span>
                <span className="font-medium">
                  {formatServiceDurationSummary(
                    service.pricing_mode,
                    service.duration_minutes,
                    service.sizePrices,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cadastrado em</span>
                <span className="font-medium">{formatDateTimeDisplay(service.created_at)}</span>
              </div>
              {service.description ? (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-muted-foreground">Descrição</p>
                  <p className="mt-1 whitespace-pre-wrap">{service.description}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {service.pricing_mode === "fixed" ? (
            <Card>
              <CardHeader>
                <CardTitle>Preço fixo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-medium">
                    {service.price_cents !== null
                      ? formatCentsToBRL(service.price_cents)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Duração</span>
                  <span className="font-medium">
                    {formatDurationLabel(service.duration_minutes)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Preços por porte</CardTitle>
                <CardDescription>
                  Duração padrão de fallback: {formatDurationLabel(service.duration_minutes)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Porte</th>
                        <th className="px-4 py-3 font-medium">Preço</th>
                        <th className="px-4 py-3 font-medium">Duração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {service.sizePrices.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-4 py-3 font-medium">{PET_SIZE_LABELS[row.size]}</td>
                          <td className="px-4 py-3">{formatCentsToBRL(row.price_cents)}</td>
                          <td className="px-4 py-3">{formatDurationLabel(row.duration_minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {service.sizePrices.map((row) => (
                    <div key={row.id} className="rounded-xl border p-4">
                      <p className="font-medium">{PET_SIZE_LABELS[row.size]}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatCentsToBRL(row.price_cents)} · {formatDurationLabel(row.duration_minutes)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Produtos e insumos utilizados</CardTitle>
            <CardDescription>
              Consumo interno padrão — não altera o preço cobrado ao cliente
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insumo configurado.</p>
            ) : (
              <ul className="space-y-3">
                {recipes.map((recipe) => (
                  <li key={recipe.id} className="flex justify-between gap-3 text-sm">
                    <span className="font-medium">{recipe.productName}</span>
                    <span className="text-muted-foreground">
                      {formatQuantity(
                        recipe.quantity,
                        PRODUCT_UNIT_SHORT_LABELS[recipe.unit],
                      )}
                    </span>
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
