import { describe, expect, it } from "vitest";

import type { FinancialEntryListItem } from "@/features/finance/types";
import {
  computeFinancialSummary,
  MAX_FINANCE_AMOUNT_CENTS,
  parseAmountToCents,
  resolveFinancialPeriod,
} from "@/features/finance/utils";

function entry(
  overrides: Partial<FinancialEntryListItem> & Pick<FinancialEntryListItem, "entry_type" | "status" | "amount_cents">,
): FinancialEntryListItem {
  return {
    id: "1",
    source_type: "manual",
    service_order_id: null,
    description: "Teste",
    category: null,
    due_date: null,
    paid_at: null,
    payment_method: null,
    notes: null,
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:00:00Z",
    cancelled_at: null,
    service_order: null,
    ...overrides,
  };
}

describe("parseAmountToCents", () => {
  it("converte BRL válido", () => {
    expect(parseAmountToCents("60,00")).toBe(6000);
  });

  it("rejeita acima do limite", () => {
    expect(parseAmountToCents("1000000,00")).toBeNull();
  });

  it("respeita limite máximo", () => {
    expect(MAX_FINANCE_AMOUNT_CENTS).toBe(99_999_999);
  });
});

describe("computeFinancialSummary", () => {
  it("calcula receita gerada, recebida e pendente", () => {
    const summary = computeFinancialSummary([
      entry({ entry_type: "income", status: "paid", amount_cents: 6000 }),
      entry({
        entry_type: "income",
        status: "partially_paid",
        amount_cents: 10_000,
        paid_cents: 6_000,
      }),
      entry({ entry_type: "expense", status: "paid", amount_cents: 2000 }),
      entry({ entry_type: "income", status: "pending", amount_cents: 5000 }),
    ]);

    expect(summary.incomeGeneratedCents).toBe(21_000);
    expect(summary.incomeReceivedCents).toBe(12_000);
    expect(summary.incomePendingCents).toBe(9_000);
    expect(summary.expensePaidCents).toBe(2000);
    expect(summary.realizedResultCents).toBe(10_000);
  });

  it("ignora cancelados", () => {
    const summary = computeFinancialSummary([
      entry({ entry_type: "income", status: "cancelled", amount_cents: 9000 }),
      entry({ entry_type: "income", status: "paid", amount_cents: 1000 }),
    ]);

    expect(summary.incomePaidCents).toBe(1000);
    expect(summary.incomeReceivedCents).toBe(1000);
    expect(summary.realizedResultCents).toBe(1000);
  });
});

describe("resolveFinancialPeriod", () => {
  const timeZone = "America/Sao_Paulo";

  it("usa mês atual por padrão", () => {
    const period = resolveFinancialPeriod({}, timeZone);
    expect(period.preset).toBe("month");
    expect(period.from.endsWith("-01")).toBe(true);
  });

  it("aceita preset today", () => {
    const period = resolveFinancialPeriod({ preset: "today" }, timeZone);
    expect(period.preset).toBe("today");
    expect(period.from).toBe(period.to);
  });
});
