import { FinanceEntryList } from "@/features/finance/components/finance-entry-list";
import { FinanceFilters } from "@/features/finance/components/finance-filters";
import { FinancePeriodNav } from "@/features/finance/components/finance-period-nav";
import { FinanceSummaryCards } from "@/features/finance/components/finance-summary-cards";
import {
  getFinancialEntries,
  getFinancialSummary,
  getPendingReceivables,
  parsePageParam,
} from "@/features/finance/queries";
import {
  parseFinancialEntryStatusFilter,
  parseFinancialEntryTypeFilter,
  parsePaymentMethodFilter,
} from "@/features/finance/status";
import { resolveFinancialPeriod } from "@/features/finance/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FinanceiroPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    preset?: string;
    type?: string;
    status?: string;
    payment?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function FinanceiroPage({ searchParams }: FinanceiroPageProps) {
  const context = await requireCompanyContext();
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveFinancialPeriod(query, timeZone);
  const type = parseFinancialEntryTypeFilter(query.type);
  const status = parseFinancialEntryStatusFilter(query.status);
  const payment = parsePaymentMethodFilter(query.payment);
  const page = parsePageParam(query.page);

  const filters = {
    type: type !== "all" ? type : undefined,
    status: status !== "all" ? status : undefined,
    payment: payment !== "all" ? payment : undefined,
    q: query.q,
  };

  const [summary, entriesResult, pendingReceivables] = await Promise.all([
    getFinancialSummary(context.membership.company.id, period.from, period.to, timeZone),
    getFinancialEntries({
      companyId: context.membership.company.id,
      from: period.from,
      to: period.to,
      timeZone,
      page,
      type,
      status,
      payment,
      query: query.q,
    }),
    status === "all" || status === "pending" || status === "partially_paid"
      ? getPendingReceivables(context.membership.company.id, 5)
      : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader
        title="Financeiro"
        description="Acompanhe entradas, saídas e valores pendentes do seu pet shop."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <FinancePeriodNav
          from={period.from}
          to={period.to}
          preset={period.preset}
          filters={filters}
        />

        <FinanceSummaryCards summary={summary} />

        {pendingReceivables.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas a receber pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <FinanceEntryList entries={pendingReceivables} timeZone={timeZone} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <FinanceFilters
              from={period.from}
              to={period.to}
              preset={period.preset}
              type={type}
              status={status}
              payment={payment}
              query={query.q ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lançamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FinanceEntryList entries={entriesResult.data} timeZone={timeZone} />
            <PaginationNav
              basePath="/dashboard/financeiro"
              page={entriesResult.page}
              totalPages={entriesResult.totalPages}
              searchParams={{
                from: period.from,
                to: period.to,
                preset: period.preset,
                ...filters,
              }}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
