import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getPdvReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function PdvReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const report = await getPdvReport(companyId, { from: period.from, to: period.to }, timeZone);

  return (
    <>
      <DashboardHeader title="Relatórios" description="PDV" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/pdv"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Total vendido" value={formatAmountCents(report.totalSoldCents)} />
          <ReportKpiCard label="Vendas" value={String(report.salesCount)} />
          <ReportKpiCard
            label="Ticket médio"
            value={report.avgTicketCents != null ? formatAmountCents(report.avgTicketCents) : "—"}
          />
          <ReportKpiCard label="Lucro bruto" value={formatAmountCents(report.grossProfitCents)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportRankingTable
              items={report.topProducts.map((p, i) => ({
                rank: i + 1,
                label: p.name,
                value: formatAmountCents(p.revenueCents),
                subtitle: `${p.unitsSold} un. · Lucro: ${formatAmountCents(p.profitCents)}`,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
