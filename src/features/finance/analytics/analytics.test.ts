import { describe, expect, it } from "vitest";

import { normalizeExpenseCategory } from "@/features/finance/analytics/constants";
import {
  buildFinancialAnalytics,
  sumBreakdownCents,
} from "@/features/finance/analytics/engine";
import { resolveFinanceAnalyticsPeriod } from "@/features/finance/analytics/period";
import type {
  AnalyticsEntryRow,
  AnalyticsPaymentRow,
  AnalyticsSaleItemRow,
} from "@/features/finance/analytics/types";

const TZ = "America/Sao_Paulo";
const PERIOD = { from: "2026-08-01", to: "2026-08-31", preset: "month" as const };
const START = "2026-08-01T03:00:00.000Z";
const END = "2026-09-01T03:00:00.000Z";

function income(partial: Partial<AnalyticsEntryRow>): AnalyticsEntryRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    entryType: "income",
    status: partial.status ?? "paid",
    sourceType: partial.sourceType ?? "manual",
    amountCents: partial.amountCents ?? 1000,
    category: partial.category ?? null,
    description: partial.description ?? "Receita",
    createdAt: partial.createdAt ?? "2026-08-10T12:00:00.000Z",
    paidAt: partial.paidAt ?? "2026-08-10T15:00:00.000Z",
    serviceOrderId: partial.serviceOrderId ?? null,
    saleId: partial.saleId ?? null,
    packageId: partial.packageId ?? null,
    detailLabel: partial.detailLabel ?? null,
  };
}

function expense(partial: Partial<AnalyticsEntryRow>): AnalyticsEntryRow {
  return {
    ...income(partial),
    entryType: "expense",
    sourceType: "manual",
    description: partial.description ?? "Despesa",
    category: partial.category ?? "Aluguel",
  };
}

function raw(
  entries: AnalyticsEntryRow[],
  payments: AnalyticsPaymentRow[] = [],
  saleItems: AnalyticsSaleItemRow[] = [],
) {
  return {
    entries,
    payments,
    saleItems,
    periodStartIso: START,
    periodEndIso: END,
  };
}

describe("financial analytics", () => {
  it("A) receita de serviço entra na origem correta", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          id: "svc-1",
          sourceType: "service_order",
          amountCents: 520_000,
          detailLabel: "Banho",
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.incomeByOrigin[0]?.key).toBe("service_order");
    expect(analytics.incomeByOrigin[0]?.cents).toBe(520_000);
  });

  it("B) receita de PDV entra na origem sale", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          id: "sale-1",
          sourceType: "sale",
          saleId: "sale-id-1",
          amountCents: 180_000,
        }),
      ], [], [{ saleId: "sale-id-1", productName: "Ração", totalCents: 180_000, costCents: 100_000 }]),
      PERIOD,
      TZ,
    );

    expect(analytics.incomeByOrigin[0]?.key).toBe("sale");
    expect(analytics.topIncomeSources[0]?.label).toBe("Ração");
  });

  it("C) receita de pacote", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          sourceType: "service_package",
          amountCents: 70_000,
          detailLabel: "Pacote mensal",
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.incomeByOrigin[0]?.key).toBe("service_package");
  });

  it("D) receita manual", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          sourceType: "manual",
          category: "Venda avulsa",
          amountCents: 30_000,
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.incomeByOrigin[0]?.key).toBe("manual");
  });

  it("E/F) despesas e categorias", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        expense({
          amountCents: 600_00,
          category: "energia",
          paidAt: "2026-08-12T15:00:00.000Z",
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.expenseByCategory[0]?.label).toBe("Energia");
    expect(analytics.kpis.expensePaidCents).toBe(600_00);
  });

  it("G/Q) filtro de período via preset", () => {
    const period = resolveFinanceAnalyticsPeriod({ preset: "last7" }, TZ);
    expect(period.preset).toBe("last7");
    expect(period.from <= period.to).toBe(true);
  });

  it("H) receita recebida usa pagamentos", () => {
    const analytics = buildFinancialAnalytics(
      raw(
        [
          income({
            id: "entry-1",
            sourceType: "sale",
            status: "partially_paid",
            amountCents: 10_000,
            paidAt: null,
          }),
        ],
        [{ entryId: "entry-1", amountCents: 4_000, paidAt: "2026-08-11T12:00:00.000Z" }],
      ),
      PERIOD,
      TZ,
    );

    expect(analytics.kpis.incomeReceivedCents).toBe(4_000);
  });

  it("I) receita pendente no período", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          amountCents: 10_000,
          status: "pending",
          paidAt: null,
          createdAt: "2026-08-05T12:00:00.000Z",
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.cashFlow.generatedCents).toBe(10_000);
    expect(analytics.cashFlow.pendingCents).toBe(10_000);
  });

  it("J) pagamento parcial reduz pendente", () => {
    const analytics = buildFinancialAnalytics(
      raw(
        [
          income({
            id: "entry-2",
            status: "partially_paid",
            amountCents: 10_000,
            paidAt: null,
          }),
        ],
        [{ entryId: "entry-2", amountCents: 6_000, paidAt: "2026-08-11T12:00:00.000Z" }],
      ),
      PERIOD,
      TZ,
    );

    expect(analytics.cashFlow.receivedCents).toBe(6_000);
    expect(analytics.cashFlow.pendingCents).toBe(4_000);
  });

  it("K) cancelamento não entra nos totais", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({ amountCents: 5_000, status: "cancelled" }),
        income({ amountCents: 2_000, status: "paid" }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.kpis.incomeReceivedCents).toBe(2_000);
  });

  it("L/M) origem correta sem duplicidade entre fontes", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({ id: "a", sourceType: "service_order", amountCents: 1000 }),
        income({ id: "b", sourceType: "sale", saleId: "s1", amountCents: 2000 }),
      ]),
      PERIOD,
      TZ,
    );

    expect(sumBreakdownCents(analytics.incomeByOrigin)).toBe(3_000);
  });

  it("N) evolução temporal agrupa receitas pagas", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({
          amountCents: 1_000,
          paidAt: "2026-08-10T15:00:00.000Z",
        }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.evolution.some((bucket) => bucket.incomeCents > 0)).toBe(true);
  });

  it("O/P) resultado líquido e margem", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({ amountCents: 10_000 }),
        expense({ amountCents: 4_000, paidAt: "2026-08-10T15:00:00.000Z" }),
      ]),
      PERIOD,
      TZ,
    );

    expect(analytics.kpis.netResultCents).toBe(6_000);
    expect(analytics.kpis.marginPercent).toBe(60);
  });

  it("P) margem com receita zero retorna null", () => {
    const analytics = buildFinancialAnalytics(raw([]), PERIOD, TZ);
    expect(analytics.kpis.marginPercent).toBeNull();
  });

  it("R) multi-tenant fica na camada de query (engine recebe dados já filtrados)", () => {
    const analytics = buildFinancialAnalytics(
      raw([income({ amountCents: 1000 })]),
      PERIOD,
      TZ,
    );
    expect(analytics.kpis.incomeReceivedCents).toBe(1000);
  });

  it("S) período sem dados", () => {
    const analytics = buildFinancialAnalytics(raw([]), PERIOD, TZ);
    expect(analytics.hasData).toBe(false);
    expect(analytics.incomeByOrigin).toHaveLength(0);
  });

  it("T) precisão dos totais bate com breakdown", () => {
    const analytics = buildFinancialAnalytics(
      raw([
        income({ sourceType: "service_order", amountCents: 1000 }),
        income({ sourceType: "sale", saleId: "s1", amountCents: 2000 }),
        income({ sourceType: "manual", amountCents: 500 }),
      ]),
      PERIOD,
      TZ,
    );

    expect(sumBreakdownCents(analytics.incomeByOrigin)).toBe(
      analytics.kpis.incomeReceivedCents,
    );
  });

  it("normaliza categorias de despesa", () => {
    expect(normalizeExpenseCategory("energia")).toBe("Energia");
    expect(normalizeExpenseCategory(null)).toBe("Outras despesas");
  });
});
