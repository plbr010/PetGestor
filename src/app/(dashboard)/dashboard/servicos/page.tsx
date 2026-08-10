import Link from "next/link";
import { Plus } from "lucide-react";

import { ServiceStatusFilterNav } from "@/features/services/components/service-status-filter";
import { getServices } from "@/features/services/queries";
import {
  formatServiceDurationSummary,
  formatServicePriceSummary,
  parseStatusFilter,
  PRICING_MODE_LABELS,
} from "@/features/services/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { parsePageParam } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  ClearSearchLink,
  PaginationNav,
  SearchForm,
} from "@/components/shared/pagination-nav";
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

type ServicesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    arquivado?: string;
  }>;
};

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";
  const status = parseStatusFilter(params.status);

  const result = await getServices({
    companyId: context.membership.company.id,
    page,
    query,
    status,
  });

  return (
    <>
      <DashboardHeader
        title="Serviços"
        description="Configure os serviços oferecidos pelo seu pet shop."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Serviço arquivado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {result.total}{" "}
              {result.total === 1 ? "serviço cadastrado" : "serviços cadastrados"}
            </p>
          </div>
          <ButtonLink href="/dashboard/servicos/novo">
            <Plus className="size-4" aria-hidden="true" />
            Novo serviço
          </ButtonLink>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Lista de serviços</CardTitle>
                <CardDescription>Busque por nome ou descrição.</CardDescription>
              </div>
              <div className="w-full lg:max-w-md">
                <SearchForm
                  action="/dashboard/servicos"
                  defaultValue={query}
                  placeholder="Buscar serviços..."
                  hiddenFields={{ status: status === "all" ? undefined : status }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ServiceStatusFilterNav current={status} searchParams={{ q: query || undefined }} />
              <ClearSearchLink
                href={`/dashboard/servicos${status === "all" ? "" : `?status=${status}`}`}
                visible={Boolean(query)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}
                description={
                  query
                    ? "Tente outro termo de busca ou cadastre um novo serviço."
                    : "Comece cadastrando o primeiro serviço do seu pet shop."
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Nome</th>
                        <th className="px-4 py-3 font-medium">Preço</th>
                        <th className="px-4 py-3 font-medium">Duração</th>
                        <th className="px-4 py-3 font-medium">Modelo</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((service) => (
                        <tr key={service.id} className="border-t">
                          <td className="px-4 py-3 font-medium">{service.name}</td>
                          <td className="px-4 py-3">
                            {formatServicePriceSummary(
                              service.pricing_mode,
                              service.price_cents,
                              service.sizePrices ?? [],
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {formatServiceDurationSummary(
                              service.pricing_mode,
                              service.duration_minutes,
                              service.sizePrices ?? [],
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {PRICING_MODE_LABELS[service.pricing_mode]}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={service.active ? "default" : "secondary"}>
                              {service.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/servicos/${service.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Ver detalhes
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {result.data.map((service) => (
                    <Link
                      key={service.id}
                      href={`/dashboard/servicos/${service.id}`}
                      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{service.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatServicePriceSummary(
                              service.pricing_mode,
                              service.price_cents,
                              service.sizePrices ?? [],
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatServiceDurationSummary(
                              service.pricing_mode,
                              service.duration_minutes,
                              service.sizePrices ?? [],
                            )}
                          </p>
                        </div>
                        <Badge variant={service.active ? "default" : "secondary"}>
                          {service.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>

                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/servicos"
                  searchParams={{
                    q: query || undefined,
                    status: status === "all" ? undefined : status,
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
