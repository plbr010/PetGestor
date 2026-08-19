import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getStockReport } from "@/features/reports/queries";
import type { StockReport } from "@/features/reports/types";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function StockReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const report = await getStockReport(companyId, { from: period.from, to: period.to }, timeZone);

  return (
    <>
      <DashboardHeader title="Relatórios" description="estoque" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/estoque"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-3">
          <ReportKpiCard label="Valor estimado" value={formatAmountCents(report.estimatedValueCents)} />
          <ReportKpiCard label="Estoque baixo" value={String(report.lowStockCount)} />
          <ReportKpiCard label="Sem estoque" value={String(report.outOfStockCount)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maiores saídas</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportRankingTable
                items={report.topExits.map((item, i) => ({
                  rank: i + 1,
                  label: item.name,
                  value: `${item.quantity} un.`,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maiores entradas</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportRankingTable
                items={report.topEntries.map((item, i) => ({
                  rank: i + 1,
                  label: item.name,
                  value: `${item.quantity} un.`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
