import { FinanceAnalyticsDashboard } from "@/features/finance/analytics/components/finance-analytics-dashboard";
import {
  getFinancialAnalyticsFromSearchParams,
  resolveFinanceAnalyticsPeriod,
} from "@/features/finance/analytics/queries";
import { FinanceEntryList } from "@/features/finance/components/finance-entry-list";
import { FinanceFilters } from "@/features/finance/components/finance-filters";
import {
  getFinancialEntries,
  getPendingReceivables,
  parsePageParam,
} from "@/features/finance/queries";
import { incomeOriginLabel } from "@/features/finance/analytics/constants";
import {
  parseFinancialEntryStatusFilter,
  parseFinancialEntryTypeFilter,
  parseFinancialSourceFilter,
  parsePaymentMethodFilter,
} from "@/features/finance/status";
import { FinanceIntroBanner } from "@/features/onboarding-tour/components/finance-intro-banner";
import { MarkOnboardingPageView } from "@/features/onboarding-tour/components/mark-onboarding-page-view";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";

type FinanceiroPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    preset?: string;
    type?: string;
    status?: string;
    payment?: string;
    source?: string;
    drillOrigin?: string;
    drillCategory?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function FinanceiroPage({ searchParams }: FinanceiroPageProps) {
  const context = await requireCompanyContext();
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveFinanceAnalyticsPeriod(query, timeZone);
  const type = parseFinancialEntryTypeFilter(query.type);
  const status = parseFinancialEntryStatusFilter(query.status);
  const payment = parsePaymentMethodFilter(query.payment);
  const source = parseFinancialSourceFilter(query.drillOrigin ?? query.source);
  const page = parsePageParam(query.page);

  const filters = {
    type: type !== "all" ? type : undefined,
    status: status !== "all" ? status : undefined,
    payment: payment !== "all" ? payment : undefined,
    q: query.q,
  };

  const listType = query.drillOrigin ? "income" : query.drillCategory ? "expense" : type;
  const drillOrigin = query.drillOrigin
    ? parseFinancialSourceFilter(query.drillOrigin)
    : "all";

  const [analytics, entriesResult, pendingReceivables] = await Promise.all([
    getFinancialAnalyticsFromSearchParams(context.membership.company.id, timeZone, query),
    getFinancialEntries({
      companyId: context.membership.company.id,
      from: period.from,
      to: period.to,
      timeZone,
      page,
      type: listType,
      status,
      payment,
      source: query.drillOrigin ? drillOrigin : source,
      drillCategory: query.drillCategory,
      query: query.q,
    }),
    status === "all" || status === "pending"
      ? getPendingReceivables(context.membership.company.id, 5)
      : Promise.resolve([]),
  ]);

  const drillTitle =
    drillOrigin !== "all"
      ? `Lançamentos: ${incomeOriginLabel(drillOrigin)}`
      : query.drillCategory
        ? `Despesas: ${query.drillCategory}`
        : null;

  return (
    <>
      <DashboardHeader
        title="Financeiro"
        description="Visualize de onde veio e para onde foi o dinheiro do pet shop."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <MarkOnboardingPageView step="finance" />
        <FinanceIntroBanner />
        <FinanceAnalyticsDashboard analytics={analytics} filters={filters} />

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
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              {drillTitle ?? "Lançamentos do período"}
            </CardTitle>
            {drillTitle ? (
              <ButtonLink
                href={`/dashboard/financeiro?from=${period.from}&to=${period.to}&preset=${period.preset}`}
                variant="outline"
                size="sm"
              >
                Limpar detalhe
              </ButtonLink>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <FinanceFilters
              from={period.from}
              to={period.to}
              preset={period.preset}
              type={listType}
              status={status}
              payment={payment}
              query={query.q ?? ""}
            />
            <FinanceEntryList entries={entriesResult.data} timeZone={timeZone} />
            <PaginationNav
              basePath="/dashboard/financeiro"
              page={entriesResult.page}
              totalPages={entriesResult.totalPages}
              searchParams={{
                from: period.from,
                to: period.to,
                preset: period.preset,
                drillOrigin: query.drillOrigin,
                drillCategory: query.drillCategory,
                ...filters,
              }}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
