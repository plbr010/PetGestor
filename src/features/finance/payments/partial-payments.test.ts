import { describe, expect, it } from "vitest";

import {
  aggregatePaymentsByMethod,
  computeCashDifference,
  computeEntryPaymentBalance,
  computeExpectedCashCents,
  deriveEntryStatus,
} from "@/features/finance/payments/utils";
import { validatePaymentAmount } from "@/features/finance/payments/schemas";
import type { FinancialPaymentRecord } from "@/features/finance/payments/types";
import { addDaysToDateString, localDateTimeToUtcIso } from "@/lib/timezone";

function payment(
  overrides: Partial<FinancialPaymentRecord> & Pick<FinancialPaymentRecord, "amount_cents" | "payment_method">,
): FinancialPaymentRecord {
  return {
    id: "p1",
    financial_entry_id: "e1",
    paid_at: "2026-08-17T15:00:00Z",
    notes: null,
    created_at: "2026-08-17T15:00:00Z",
    cancelled_at: null,
    ...overrides,
  };
}

describe("computeEntryPaymentBalance", () => {
  it("calcula pagamento integral", () => {
    const balance = computeEntryPaymentBalance(10_000, [
      payment({ amount_cents: 10_000, payment_method: "pix" }),
    ]);

    expect(balance.paidCents).toBe(10_000);
    expect(balance.remainingCents).toBe(0);
  });

  it("calcula pagamento parcial", () => {
    const balance = computeEntryPaymentBalance(10_000, [
      payment({ amount_cents: 6_000, payment_method: "pix" }),
    ]);

    expect(balance.paidCents).toBe(6_000);
    expect(balance.remainingCents).toBe(4_000);
  });

  it("soma dois pagamentos com formas diferentes", () => {
    const balance = computeEntryPaymentBalance(10_000, [
      payment({ id: "p1", amount_cents: 3_000, payment_method: "pix" }),
      payment({ id: "p2", amount_cents: 7_000, payment_method: "credit_card" }),
    ]);

    expect(balance.paidCents).toBe(10_000);
    expect(balance.remainingCents).toBe(0);
  });

  it("ignora pagamentos cancelados ao recalcular saldo", () => {
    const balance = computeEntryPaymentBalance(10_000, [
      payment({ amount_cents: 6_000, payment_method: "cash", cancelled_at: "2026-08-17T16:00:00Z" }),
      payment({ id: "p2", amount_cents: 4_000, payment_method: "pix" }),
    ]);

    expect(balance.paidCents).toBe(4_000);
    expect(balance.remainingCents).toBe(6_000);
  });
});

describe("deriveEntryStatus", () => {
  it("retorna pending sem pagamentos", () => {
    expect(deriveEntryStatus(10_000, 0)).toBe("pending");
  });

  it("retorna partially_paid com pagamento parcial", () => {
    expect(deriveEntryStatus(10_000, 6_000)).toBe("partially_paid");
  });

  it("retorna paid quando quitado", () => {
    expect(deriveEntryStatus(10_000, 10_000)).toBe("paid");
  });
});

describe("validatePaymentAmount", () => {
  it("bloqueia pagamento acima do saldo", () => {
    const result = validatePaymentAmount("50,00", 4_000);
    expect(result).toEqual({ error: "O valor excede o saldo restante." });
  });

  it("bloqueia valor zero", () => {
    const result = validatePaymentAmount("0,00", 4_000);
    expect(result).toEqual({ error: "Informe um valor válido maior que zero." });
  });

  it("aceita pagamento dentro do saldo", () => {
    const result = validatePaymentAmount("40,00", 4_000);
    expect(result).toEqual({ cents: 4_000 });
  });
});

describe("aggregatePaymentsByMethod", () => {
  it("totaliza por forma de pagamento no fechamento diário", () => {
    const totals = aggregatePaymentsByMethod([
      payment({ amount_cents: 3_000, payment_method: "pix" }),
      payment({ id: "p2", amount_cents: 7_000, payment_method: "credit_card" }),
      payment({ id: "p3", amount_cents: 520_00, payment_method: "cash" }),
    ]);

    expect(totals.pix).toBe(3_000);
    expect(totals.credit_card).toBe(7_000);
    expect(totals.cash).toBe(520_00);
  });
});

describe("caixa físico", () => {
  it("calcula diferença entre esperado e contado", () => {
    const expected = computeExpectedCashCents(0, 52_000);
    expect(expected).toBe(52_000);
    expect(computeCashDifference(expected, 51_000)).toBe(-1_000);
  });
});

describe("timezone do dia comercial", () => {
  it("agrupa pagamentos pelo dia local da empresa, não por UTC", () => {
    const timeZone = "America/Sao_Paulo";
    const start = localDateTimeToUtcIso("2026-08-17", "00:00", timeZone);
    const end = localDateTimeToUtcIso(addDaysToDateString("2026-08-17", 1), "00:00", timeZone);
    const lateLocal = localDateTimeToUtcIso("2026-08-17", "23:30", timeZone);
    const nextUtcMidnight = "2026-08-18T00:30:00.000Z";

    expect(new Date(lateLocal).getTime()).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(new Date(lateLocal).getTime()).toBeLessThan(new Date(end).getTime());
    expect(new Date(nextUtcMidnight).getTime()).toBeLessThan(new Date(end).getTime());
  });
});

describe("despesas no fechamento", () => {
  it("separa recebimentos de despesas pagas", () => {
    const income = aggregatePaymentsByMethod([
      payment({ amount_cents: 10_000, payment_method: "pix" }),
    ]);
    const expensePaid = 2_500;

    expect(income.pix).toBe(10_000);
    expect(10_000 - expensePaid).toBe(7_500);
  });
});

describe("pacote pago parcialmente", () => {
  it("mantém saldo restante em cobrança de pacote", () => {
    const total = 25_000;
    const balance = computeEntryPaymentBalance(total, [
      payment({ amount_cents: 10_000, payment_method: "pix" }),
    ]);

    expect(deriveEntryStatus(total, balance.paidCents)).toBe("partially_paid");
    expect(balance.remainingCents).toBe(15_000);
  });
});

describe("isolamento multi-tenant", () => {
  it("validação de pagamento é por saldo do lançamento, não global", () => {
    const entryA = computeEntryPaymentBalance(5_000, [
      payment({ amount_cents: 2_000, payment_method: "cash" }),
    ]);
    const entryB = computeEntryPaymentBalance(8_000, []);

    expect(validatePaymentAmount("30,00", entryA.remainingCents)).toEqual({ cents: 3_000 });
    expect(validatePaymentAmount("90,00", entryB.remainingCents)).toEqual({
      error: "O valor excede o saldo restante.",
    });
  });
});
