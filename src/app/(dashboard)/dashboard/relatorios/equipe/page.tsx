import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { resolveReportPeriod } from "@/features/reports/period";
import { getEmployeePerformance, getOccupancyReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportExportRow } from "@/features/reports/components/report-export-row";
import { reportCsvFilename, teamToCsv } from "@/features/reports/csv-builders";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function EmployeeReportPage({ searchParams }: PageProps) {
  const context = await requirePermission("reports.view");
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const period = resolveReportPeriod(query, timeZone);
  const companyId = context.membership.company.id;

  const [employees, occupancy] = await Promise.all([
    getEmployeePerformance(companyId, { from: period.from, to: period.to }, timeZone),
    getOccupancyReport(companyId, { from: period.from, to: period.to }, timeZone),
  ]);

  return (
    <>
      <DashboardHeader title="Relatórios" description="equipe" />
      <main className="space-y-6 px-4 py-6 sm:px-6">
        <ReportPeriodNav
          basePath="/dashboard/relatorios/equipe"
          from={period.from}
          to={period.to}
          preset={period.preset}
        />
        <ReportExportRow
          csv={teamToCsv(employees, occupancy)}
          filename={reportCsvFilename("equipe", period.from, period.to)}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Capacidade" value={`${occupancy.capacityMinutes} min`} />
          <ReportKpiCard
            label="Reservado"
            value={`${occupancy.overallPercent.toFixed(1).replace(".", ",")}%`}
          />
          <ReportKpiCard
            label="Realizado"
            value={`${occupancy.overallServedPercent.toFixed(1).replace(".", ",")}%`}
          />
          <ReportKpiCard label="No-show" value={`${occupancy.noShowMinutes} min`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocupação da agenda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              Capacidade em minutos reais do período civil (jornada menos intervalo). Reservado
              inclui confirmed/scheduled/in_progress/completed/no-show. Realizado é só completed.
              Cancelado não ocupa capacidade.
            </p>
            <p>
              {occupancy.reservedMinutes} min reservados · {occupancy.servedMinutes} min
              realizados · {occupancy.cancelledMinutes} min cancelados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desempenho por colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum dado disponível neste período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Colaborador</th>
                      <th className="pb-2 pr-4 text-right font-medium">Atendimentos</th>
                      <th className="pb-2 pr-4 text-right font-medium">Receita</th>
                      <th className="pb-2 pr-4 text-right font-medium">Média/dia</th>
                      <th className="pb-2 text-right font-medium">Cancelamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.employeeId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{emp.employeeName}</td>
                        <td className="py-2 pr-4 text-right">{emp.appointmentsCount}</td>
                        <td className="py-2 pr-4 text-right">{formatAmountCents(emp.revenueCents)}</td>
                        <td className="py-2 pr-4 text-right">
                          {emp.avgPerDay.toFixed(1).replace(".", ",")}
                        </td>
                        <td className="py-2 text-right">{emp.cancellations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
