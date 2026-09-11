import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveReportPeriod } from "@/features/reports/period";
import { getPetReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportExportRow } from "@/features/reports/components/report-export-row";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";
import { petsToCsv, reportCsvFilename } from "@/features/reports/csv-builders";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function PetsReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const report = await getPetReport(companyId, { from: period.from, to: period.to }, timeZone);

  return (
    <>
      <DashboardHeader title="Relatórios" description="pets" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/pets"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportExportRow
          csv={petsToCsv(report)}
          filename={reportCsvFilename("pets", period.from, period.to)}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2">
          <ReportKpiCard label="Pets atendidos" value={String(report.attendedCount)} />
          <ReportKpiCard label="Novos no período" value={String(report.newCount)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mais atendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportRankingTable
              items={report.topByVisits.map((pet, index) => ({
                rank: index + 1,
                id: pet.id,
                label: pet.name,
                value: `${pet.count}x`,
                subtitle: pet.species,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
