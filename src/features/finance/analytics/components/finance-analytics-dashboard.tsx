import {
  FinanceAnalyticsCashFlow,
  FinanceAnalyticsKpis,
} from "@/features/finance/analytics/components/finance-analytics-kpis";
import {
  FinanceBreakdownChart,
  FinanceEvolutionChart,
} from "@/features/finance/analytics/components/finance-analytics-charts";
import { FinanceAnalyticsPeriodNav } from "@/features/finance/analytics/components/finance-analytics-period-nav";
import {
  FinanceAnalyticsRankings,
  FinanceProfitByOrigin,
} from "@/features/finance/analytics/components/finance-analytics-rankings";
import type { FinanceAnalytics } from "@/features/finance/analytics/types";
import { ButtonLink } from "@/components/ui/button-link";

type FinanceAnalyticsDashboardProps = {
  analytics: FinanceAnalytics;
  filters: Record<string, string | undefined>;
};

export function FinanceAnalyticsDashboard({
  analytics,
  filters,
}: FinanceAnalyticsDashboardProps) {
  const periodParams = {
    from: analytics.period.from,
    to: analytics.period.to,
    preset: analytics.period.preset,
    type: filters.type,
    status: filters.status,
    payment: filters.payment,
    q: filters.q,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FinanceAnalyticsPeriodNav
          from={analytics.period.from}
          to={analytics.period.to}
          preset={analytics.period.preset}
          filters={filters}
        />
        <div className="flex gap-2">
          <ButtonLink href="/dashboard/financeiro/nova-receita" size="sm">
            Nova receita
          </ButtonLink>
          <ButtonLink href="/dashboard/financeiro/nova-despesa" variant="outline" size="sm">
            Nova despesa
          </ButtonLink>
        </div>
      </div>

      <FinanceAnalyticsKpis analytics={analytics} />

      <FinanceEvolutionChart analytics={analytics} />

      <div className="grid gap-6 xl:grid-cols-2">
        <FinanceBreakdownChart
          title="De onde veio o dinheiro"
          items={analytics.incomeByOrigin}
          drillParam="drillOrigin"
          periodParams={periodParams}
          emptyMessage="Ainda não há receitas recebidas neste período."
        />
        <FinanceBreakdownChart
          title="Para onde foi o dinheiro"
          items={analytics.expenseByCategory}
          drillParam="drillCategory"
          periodParams={periodParams}
          emptyMessage="Ainda não há despesas pagas neste período."
        />
      </div>

      <FinanceAnalyticsCashFlow analytics={analytics} />

      <FinanceAnalyticsRankings
        topIncome={analytics.topIncomeSources}
        topExpenses={analytics.topExpenses}
      />

      <FinanceProfitByOrigin items={analytics.profitByOrigin} />
    </div>
  );
}
