import { formatAmountCents } from "@/features/finance/utils";
import { formatQuantity } from "@/features/inventory/stock-engine";

import { toCsv } from "./csv";
import type {
  AppointmentsReport,
  CancellationReport,
  CustomerReport,
  EmployeePerformance,
  OccupancyReport,
  PackagesReport,
  PdvReport,
  PetReport,
  ReportOverview,
  RetentionReport,
  ServiceRanking,
  StockReport,
} from "./types";

function money(cents: number | null | undefined): string {
  if (cents == null) {
    return "";
  }
  return formatAmountCents(cents);
}

export function overviewToCsv(
  report: ReportOverview,
  options?: { includeFinance?: boolean },
): string {
  const includeFinance = options?.includeFinance ?? true;
  const rows: string[][] = [];
  if (includeFinance) {
    rows.push(
      ["Faturamento (atendimentos concluídos)", money(report.revenueCents), money(report.prevRevenueCents)],
      ["Receita recebida (financial_payments)", money(report.incomeReceivedCents), money(report.prevIncomeReceivedCents)],
      ["Despesas pagas", money(report.expensePaidCents), money(report.prevExpensePaidCents)],
      ["Resultado líquido", money(report.netResultCents), money(report.prevNetResultCents)],
    );
  }
  rows.push(
    ["Atendimentos concluídos", String(report.appointmentsCount), String(report.prevAppointmentsCount ?? "")],
    ["Ticket médio", money(report.avgTicketCents), money(report.prevAvgTicketCents)],
    ["Vendas PDV", String(report.salesCount), String(report.prevSalesCount ?? "")],
    ["Novos clientes", String(report.newCustomersCount), String(report.prevNewCustomersCount ?? "")],
    ["Cancelamentos", String(report.cancellationsCount), String(report.prevCancellationsCount ?? "")],
    ["Faltas (no-show)", String(report.noShowCount), String(report.prevNoShowCount ?? "")],
  );
  return toCsv(["Indicador", "Atual", "Anterior"], rows);
}

export function appointmentsToCsv(report: AppointmentsReport, rankings: ServiceRanking[]): string {
  const statusRows = [
    ["Total", String(report.total), ""],
    ["Concluídos", String(report.completed), money(report.avgTicketCents)],
    ["Aguardando", String(report.waiting), ""],
    ["Cancelados", String(report.cancelled), ""],
    ["Faltas (no-show)", String(report.noShow), ""],
  ];
  const rankingRows = rankings.map((row) => [
    row.serviceName,
    String(row.count),
    money(row.revenueCents),
  ]);
  return toCsv(
    ["Métrica / Serviço", "Quantidade", "Receita"],
    [...statusRows, ...rankingRows],
  );
}

export function customersToCsv(report: CustomerReport, retention: RetentionReport): string {
  const kpi = [
    ["Ativos", String(report.activeCount), ""],
    ["Novos", String(report.newCount), ""],
    ["Recorrentes", String(report.recurringCount), ""],
    ["Inativos", String(report.inactiveCount), `${report.inactiveDays} dias`],
    ["Taxa de retorno", `${retention.returnRate}%`, retention.explanation],
  ];
  const spend = report.topBySpend.map((row) => [row.name, String(row.count), money(row.totalCents)]);
  return toCsv(["Cliente / KPI", "Atendimentos", "Gasto"], [...kpi, ...spend]);
}

export function petsToCsv(report: PetReport): string {
  const kpis = [
    ["Pets atendidos", String(report.attendedCount), ""],
    ["Novos no período", String(report.newCount), ""],
  ];
  const visits = report.topByVisits.map((row) => [row.name, row.species, String(row.count)]);
  return toCsv(["Pet / KPI", "Espécie", "Visitas"], [...kpis, ...visits]);
}

export function teamToCsv(employees: EmployeePerformance[], occupancy: OccupancyReport): string {
  const occupancyRows = [
    ["Capacidade (min)", String(occupancy.capacityMinutes), ""],
    ["Reservado (min)", String(occupancy.reservedMinutes), `${occupancy.overallPercent}%`],
    ["Realizado (min)", String(occupancy.servedMinutes), `${occupancy.overallServedPercent}%`],
    ["No-show (min)", String(occupancy.noShowMinutes), "não conta como executado"],
    ["Cancelado (min)", String(occupancy.cancelledMinutes), "não ocupa capacidade"],
  ];
  const people = employees.map((row) => [
    row.employeeName,
    String(row.appointmentsCount),
    money(row.revenueCents),
  ]);
  return toCsv(["Colaborador / KPI", "Atendimentos / minutos", "Receita / detalhe"], [
    ...occupancyRows,
    ...people,
  ]);
}

export function cancellationsToCsv(report: CancellationReport): string {
  return toCsv(
    ["Data", "Cancelados", "Faltas"],
    report.byDay.map((row) => [row.label, String(row.cancelled), String(row.noShow)]),
  );
}

export function pdvToCsv(report: PdvReport): string {
  const kpis = [
    ["Total vendido", "", money(report.totalSoldCents)],
    ["Vendas válidas", String(report.salesCount), ""],
    ["Ticket médio", "", money(report.avgTicketCents)],
    ["Lucro bruto", "", money(report.grossProfitCents)],
  ];
  const products = report.topProducts.map((row) => [
    row.productId,
    row.name,
    String(row.unitsSold),
    money(row.revenueCents),
    money(row.profitCents),
  ]);
  return toCsv(
    ["product_id", "Produto", "Unidades", "Receita", "Lucro"],
    [
      ...kpis.map((row) => [row[0] ?? "", "", row[1] ?? "", row[2] ?? "", ""]),
      ...products,
    ],
  );
}

export function stockToCsv(report: StockReport, from: string, to: string): string {
  const kpis = [
    ["Valor estimado", money(report.estimatedValueCents), "", from, to],
    ["Estoque baixo", String(report.lowStockCount), "", from, to],
    ["Sem estoque", String(report.outOfStockCount), "", from, to],
    ["Divergências de reconciliação", String(report.reconciliationDivergenceCount), "", from, to],
  ];
  const losses = report.losses.map((row) => [
    row.productName,
    formatQuantity(row.quantity, row.unit),
    row.reason ?? "",
    money(row.estimatedCostCents),
    `${from} a ${to}`,
  ]);
  const expired = [
    ...report.expired,
    ...report.expiresToday,
    ...report.expiringSoon,
  ].map((row) => [
    row.productName,
    row.batchCode,
    row.expirationDate,
    row.bucket,
    formatQuantity(row.quantity, row.unit),
  ]);
  return toCsv(
    ["Item", "Quantidade / lote", "Motivo / validade", "Custo / classificação", "Período"],
    [...kpis, ...losses, ...expired],
  );
}

export function packagesToCsv(report: PackagesReport): string {
  return toCsv(
    ["KPI", "Valor"],
    [
      ["Vendidos (não cancelados)", String(report.soldCount)],
      ["Faturado (snapshot)", money(report.billedCents)],
      ["Recebido (pago, não cancelado)", money(report.receivedCents)],
      ["Pagamento pendente", String(report.pendingCount)],
      ["Ativos", String(report.activeCount)],
      ["Expirados", String(report.expiredCount)],
      ["Totalmente utilizados", String(report.fullyUsedCount)],
      ["Cancelados", String(report.cancelledCount)],
      ["Créditos restantes (ativos)", String(report.totalCreditsRemaining)],
      ["Inconsistências de legado", String(report.inconsistencies.length)],
    ],
  );
}

export function reportCsvFilename(slug: string, from: string, to: string): string {
  return `relatorio-${slug}-${from}-${to}.csv`;
}
