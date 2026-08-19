import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Receipt,
  ShoppingCart,
  UserPlus,
  XCircle,
} from "lucide-react";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { requirePermission, checkPermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getReportOverview } from "@/features/reports/queries";
import { changePercent } from "@/features/reports/utils";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";

type PageProps = {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function ReportsOverviewPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const companyId = context.membership.company.id;
  const period = resolveReportPeriod(query, timeZone);

  const canViewFinance = checkPermission(context, "finance.view");

  const overview = await getReportOverview(companyId, query, timeZone);

  return (
    <>
      <DashboardHeader title="Relatórios" description="análise de desempenho do pet shop" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canViewFinance ? (
            <>
              <ReportKpiCard
                label="Faturamento"
                value={formatAmountCents(overview.revenueCents)}
                prevValue={overview.prevRevenueCents != null ? formatAmountCents(overview.prevRevenueCents) : null}
                changePercent={changePercent(overview.revenueCents, overview.prevRevenueCents)}
                icon={DollarSign}
              />
              <ReportKpiCard
                label="Receita recebida"
                value={formatAmountCents(overview.incomeReceivedCents)}
                prevValue={overview.prevIncomeReceivedCents != null ? formatAmountCents(overview.prevIncomeReceivedCents) : null}
                changePercent={changePercent(overview.incomeReceivedCents, overview.prevIncomeReceivedCents)}
                icon={TrendingUp}
              />
              <ReportKpiCard
                label="Despesas"
                value={formatAmountCents(overview.expensePaidCents)}
                prevValue={overview.prevExpensePaidCents != null ? formatAmountCents(overview.prevExpensePaidCents) : null}
                changePercent={changePercent(overview.expensePaidCents, overview.prevExpensePaidCents)}
                icon={TrendingDown}
              />
              <ReportKpiCard
                label="Resultado líquido"
                value={formatAmountCents(overview.netResultCents)}
                prevValue={overview.prevNetResultCents != null ? formatAmountCents(overview.prevNetResultCents) : null}
                changePercent={changePercent(overview.netResultCents, overview.prevNetResultCents)}
                icon={Receipt}
              />
            </>
          ) : null}
          <ReportKpiCard
            label="Atendimentos"
            value={String(overview.appointmentsCount)}
            prevValue={overview.prevAppointmentsCount != null ? String(overview.prevAppointmentsCount) : null}
            changePercent={changePercent(overview.appointmentsCount, overview.prevAppointmentsCount)}
            icon={Calendar}
          />
          <ReportKpiCard
            label="Ticket médio"
            value={overview.avgTicketCents != null ? formatAmountCents(overview.avgTicketCents) : "—"}
            prevValue={overview.prevAvgTicketCents != null ? formatAmountCents(overview.prevAvgTicketCents) : null}
            changePercent={changePercent(overview.avgTicketCents ?? 0, overview.prevAvgTicketCents)}
            icon={ShoppingCart}
          />
          <ReportKpiCard
            label="Vendas PDV"
            value={String(overview.salesCount)}
            prevValue={overview.prevSalesCount != null ? String(overview.prevSalesCount) : null}
            changePercent={changePercent(overview.salesCount, overview.prevSalesCount)}
            icon={ShoppingCart}
          />
          <ReportKpiCard
            label="Novos clientes"
            value={String(overview.newCustomersCount)}
            prevValue={overview.prevNewCustomersCount != null ? String(overview.prevNewCustomersCount) : null}
            changePercent={changePercent(overview.newCustomersCount, overview.prevNewCustomersCount)}
            icon={UserPlus}
          />
          <ReportKpiCard
            label="Cancelamentos + faltas"
            value={`${overview.cancellationsCount} + ${overview.noShowCount}`}
            icon={XCircle}
          />
        </div>

        <ReportSubnav />
      </main>
    </>
  );
}
