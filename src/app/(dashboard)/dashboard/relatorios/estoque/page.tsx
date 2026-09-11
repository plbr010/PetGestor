import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatAmountCents } from "@/features/finance/utils";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { resolveReportPeriod } from "@/features/reports/period";
import { getStockReport } from "@/features/reports/queries";
import { ReportKpiCard } from "@/features/reports/components/report-kpi-card";
import { ReportPeriodNav } from "@/features/reports/components/report-period-nav";
import { ReportSubnav } from "@/features/reports/components/report-subnav";
import { ReportExportRow } from "@/features/reports/components/report-export-row";
import { ReportRankingTable } from "@/features/reports/components/report-ranking-table";
import { reportCsvFilename, stockToCsv } from "@/features/reports/csv-builders";
import type { StockExpiringRow, StockLossRow } from "@/features/reports/types";

type PageProps = {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

function lossItems(rows: StockLossRow[]) {
  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.productId,
    label: row.productName,
    value: formatQuantity(row.quantity, row.unit),
    subtitle: [
      row.reason ? `Motivo: ${row.reason}` : null,
      row.estimatedCostCents != null ? `Custo: ${formatAmountCents(row.estimatedCostCents)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

function expirationItems(rows: StockExpiringRow[]) {
  return rows.map((row, index) => ({
    rank: index + 1,
    id: `${row.productId}-${row.batchCode}-${row.expirationDate}`,
    label: row.productName,
    value: formatQuantity(row.quantity, row.unit),
    subtitle: `${row.batchCode || "sem lote"} · ${row.expirationDate}`,
  }));
}

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
        <ReportExportRow
          csv={stockToCsv(report, period.from, period.to)}
          filename={reportCsvFilename("estoque", period.from, period.to)}
        />
        <ReportSubnav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportKpiCard label="Valor estimado" value={formatAmountCents(report.estimatedValueCents)} />
          <ReportKpiCard label="Estoque baixo" value={String(report.lowStockCount)} />
          <ReportKpiCard label="Sem estoque" value={String(report.outOfStockCount)} />
          <ReportKpiCard
            label="Divergências"
            value={String(report.reconciliationDivergenceCount)}
          />
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
                  id: item.productId,
                  label: item.name,
                  value: `${item.quantity}`,
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
                  id: item.productId,
                  label: item.name,
                  value: `${item.quantity}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perdas no período</CardTitle>
          </CardHeader>
          <CardContent>
            {report.losses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma perda registrada neste período.</p>
            ) : (
              <ReportRankingTable items={lossItems(report.losses)} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vencidos</CardTitle>
            </CardHeader>
            <CardContent>
              {report.expired.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lote vencido.</p>
              ) : (
                <ReportRankingTable items={expirationItems(report.expired)} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vence hoje</CardTitle>
            </CardHeader>
            <CardContent>
              {report.expiresToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lote vence hoje.</p>
              ) : (
                <ReportRankingTable items={expirationItems(report.expiresToday)} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">A vencer (30 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              {report.expiringSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lote a vencer na janela.</p>
              ) : (
                <ReportRankingTable items={expirationItems(report.expiringSoon)} />
              )}
            </CardContent>
          </Card>
        </div>

        {report.unknownMovements.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentos com tipo desconhecido</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportRankingTable
                items={report.unknownMovements.map((row, index) => ({
                  rank: index + 1,
                  id: `${row.productId}-${row.type}-${index}`,
                  label: row.productName,
                  value: String(row.quantity),
                  subtitle: row.type,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {report.reconciliationDivergenceCount > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reconciliação — divergência de legado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Saldo esperado pela soma dos movimentos difere de current_stock. Somente leitura —
                sem autofix.
              </p>
              <ReportRankingTable
                items={report.reconciliation
                  .filter((row) => row.hasLegacyDivergence)
                  .slice(0, 20)
                  .map((row, index) => ({
                    rank: index + 1,
                    id: row.productId,
                    label: row.productName,
                    value: String(row.divergence),
                    subtitle: `movimentos ${row.allTimeFromMovements} · atual ${row.currentStock}`,
                  }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </main>
    </>
  );
}
