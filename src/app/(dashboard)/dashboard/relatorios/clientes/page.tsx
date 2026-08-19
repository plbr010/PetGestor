import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getCustomerReport, getRetentionReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function CustomersReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const [report, retention] = await Promise.all([
    getCustomerReport(companyId, { from: period.from, to: period.to }, timeZone),
    getRetentionReport(companyId, { from: period.from, to: period.to }, timeZone),
  ]);

  return (
    <>
      <DashboardHeader title="Relatórios" description="clientes" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/clientes"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Ativos" value={String(report.activeCount)} />
          <ReportKpiCard label="Novos" value={String(report.newCount)} />
          <ReportKpiCard label="Recorrentes" value={String(report.recurringCount)} />
          <ReportKpiCard label="Inativos" value={`${report.inactiveCount} (${report.inactiveDays}d)`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxa de retorno</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {retention.returnRate.toFixed(1).replace(".", ",")}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{retention.explanation}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top clientes por gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportRankingTable
              items={report.topBySpend.map((c, i) => ({
                rank: i + 1,
                label: c.name,
                value: formatAmountCents(c.totalCents),
                subtitle: `${c.count} atendimentos`,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
