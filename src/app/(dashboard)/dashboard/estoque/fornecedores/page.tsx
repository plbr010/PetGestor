import Link from "next/link";
import { Plus } from "lucide-react";

import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { getInventorySuppliers } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { parsePageParam } from "@/lib/pagination";
import { formatPhoneDisplay } from "@/lib/phone";
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

type SuppliersPageProps = {
  searchParams: Promise<{ page?: string; q?: string; arquivado?: string }>;
};

export default async function InventorySuppliersPage({ searchParams }: SuppliersPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = parsePageParam(params.page);
  const result = await getInventorySuppliers(context.membership.company.id, {
    query,
    page,
  });

  return (
    <>
      <DashboardHeader title="Fornecedores" description="cadastro simples para entradas" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Fornecedor arquivado com sucesso." variant="success" />
        ) : null}
        <InventorySubnav current="fornecedores" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "fornecedor" : "fornecedores"}
          </p>
          <ButtonLink href="/dashboard/estoque/fornecedores/novo" className="min-h-11">
            <Plus className="size-4" aria-hidden="true" />
            Novo fornecedor
          </ButtonLink>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Lista</CardTitle>
                <CardDescription>Fornecedores da empresa, sem módulo de compras.</CardDescription>
              </div>
              <div className="w-full lg:max-w-md">
                <SearchForm
                  action="/dashboard/estoque/fornecedores"
                  defaultValue={query}
                  placeholder="Buscar fornecedores..."
                />
              </div>
            </div>
            <ClearSearchLink href="/dashboard/estoque/fornecedores" visible={Boolean(query)} />
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
                description="Cadastre um fornecedor para vinculá-lo nas entradas de estoque."
              />
            ) : (
              <>
                <div className="grid gap-3">
                  {result.data.map((supplier) => (
                    <Link
                      key={supplier.id}
                      href={`/dashboard/estoque/fornecedores/${supplier.id}`}
                      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {supplier.contact_name ?? "Sem contato"}
                            {supplier.phone ? ` · ${formatPhoneDisplay(supplier.phone)}` : ""}
                          </p>
                        </div>
                        <Badge variant={supplier.active ? "default" : "secondary"}>
                          {supplier.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/estoque/fornecedores"
                  searchParams={{ q: query || undefined }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
