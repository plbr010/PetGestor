import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getAppointmentsReport, getServiceRankings } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportLineChart } from "@/features/reports/components/report-line-chart";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function AppointmentsReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const [report, rankings] = await Promise.all([
    getAppointmentsReport(companyId, { from: period.from, to: period.to }, timeZone),
    getServiceRankings(companyId, { from: period.from, to: period.to }, timeZone),
  ]);

  const hasData = report.total > 0;

  return (
    <>
      <DashboardHeader title="Relatórios" description="atendimentos" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/atendimentos"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Total" value={String(report.total)} />
          <ReportKpiCard label="Concluídos" value={String(report.completed)} />
          <ReportKpiCard label="Cancelados" value={String(report.cancelled)} />
          <ReportKpiCard
            label="Ticket médio"
            value={report.avgTicketCents != null ? formatAmountCents(report.avgTicketCents) : "—"}
          />
        </div>

        {hasData && report.byDay.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atendimentos por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportLineChart
                data={report.byDay.map((d) => ({ label: d.label, value: d.count }))}
                color="var(--chart-1)"
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de serviços</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportRankingTable
              items={rankings.map((r, i) => ({
                rank: i + 1,
                label: r.serviceName,
                value: `${r.count}x`,
                subtitle: `${formatAmountCents(r.revenueCents)} · ${r.percentOfTotal.toFixed(1).replace(".", ",")}%`,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
