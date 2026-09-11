import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getPackagesReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportExportRow } from "@/features/reports/components/report-export-row";
import { packagesToCsv, reportCsvFilename } from "@/features/reports/csv-builders";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function PackagesReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const report = await getPackagesReport(companyId, { from: period.from, to: period.to }, timeZone);

  return (
    <>
      <DashboardHeader title="Relatórios" description="pacotes" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/pacotes"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportExportRow
          csv={packagesToCsv(report)}
          filename={reportCsvFilename("pacotes", period.from, period.to)}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Vendidos" value={String(report.soldCount)} />
          <ReportKpiCard label="Recebido" value={formatAmountCents(report.receivedCents)} />
          <ReportKpiCard label="Ativos" value={String(report.activeCount)} />
          <ReportKpiCard label="Créditos restantes" value={String(report.totalCreditsRemaining)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Pendentes" value={String(report.pendingCount)} />
          <ReportKpiCard label="Expirados" value={String(report.expiredCount)} />
          <ReportKpiCard label="Utilizados" value={String(report.fullyUsedCount)} />
          <ReportKpiCard label="Cancelados" value={String(report.cancelledCount)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Definições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Vendido: pacote comprado no período, excluindo cancelados.</p>
            <p>Recebido: financeiro paid e pacote não cancelado. Pending não é receita recebida.</p>
            <p>
              Ativo: pago, com saldo, expires_at ≥ hoje civil da empresa. Vence hoje continua válido.
            </p>
            <p>Expirado: expires_at &lt; hoje civil, mesmo se o status persistido ainda for active.</p>
          </CardContent>
        </Card>

        {report.inconsistencies.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inconsistências de legado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {report.inconsistencies.map((item) => (
                <p key={`${item.kind}-${item.packageId}`}>
                  {item.detail} {item.packageId ? `(${item.packageId})` : ""}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </>
  );
}
