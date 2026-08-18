import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { StockMovementList } from "@/features/inventory/components/stock-movement-list";
import { getStockMovements } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { parsePageParam } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MovementsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function StockMovementsPage({ searchParams }: MovementsPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const result = await getStockMovements({
    companyId: context.membership.company.id,
    page,
    pageSize: 30,
  });

  return (
    <>
      <DashboardHeader title="Movimentações" description="histórico de estoque" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <InventorySubnav current="movimentacoes" />
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Da mais recente para a mais antiga. Movimentações não podem ser apagadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title="Nenhuma movimentação"
                description="As entradas, saídas e ajustes aparecerão aqui."
              />
            ) : (
              <>
                <StockMovementList
                  movements={result.data}
                  timeZone={context.membership.company.timezone}
                  showProductName
                />
                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/estoque/movimentacoes"
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
