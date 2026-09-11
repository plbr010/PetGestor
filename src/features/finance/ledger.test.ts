import { describe, expect, it } from "vitest";

import {
  classifyCancel,
  classifyReopen,
  deriveFinancialStatus,
  entryMatchesPaymentMethodFilter,
  receivedCents,
  remainingCents,
  uniqueById,
  wouldOverpay,
  type ActiveFinancialPayment,
} from "@/features/finance/ledger";

function payment(
  overrides: Partial<ActiveFinancialPayment> & Pick<ActiveFinancialPayment, "amountCents" | "paymentMethod">,
): ActiveFinancialPayment {
  return {
    entryId: "entry-1",
    paidAt: "2026-09-11T12:00:00.000Z",
    cancelledAt: null,
    ...overrides,
  };
}

describe("receivedCents / remainingCents", () => {
  it("pending R$100 → recebido 0, a receber R$100", () => {
    const snapshot = {
      amountCents: 10000,
      status: "pending" as const,
      payments: [],
    };

    expect(receivedCents(snapshot)).toBe(0);
    expect(remainingCents(snapshot)).toBe(10000);
  });

  it("parcial R$100 / R$30 pago → a receber R$70", () => {
    const snapshot = {
      amountCents: 10000,
      status: "partially_paid" as const,
      payments: [payment({ amountCents: 3000, paymentMethod: "pix" })],
    };

    expect(receivedCents(snapshot)).toBe(3000);
    expect(remainingCents(snapshot)).toBe(7000);
    expect(deriveFinancialStatus({ amountCents: 10000, receivedCents: 3000 })).toBe("partially_paid");
  });

  it("pago integral → remaining 0", () => {
    const snapshot = {
      amountCents: 10000,
      status: "paid" as const,
      payments: [
        payment({ amountCents: 3000, paymentMethod: "pix" }),
        payment({ amountCents: 7000, paymentMethod: "cash" }),
      ],
    };

    expect(receivedCents(snapshot)).toBe(10000);
    expect(remainingCents(snapshot)).toBe(0);
    expect(deriveFinancialStatus({ amountCents: 10000, receivedCents: 10000 })).toBe("paid");
  });

  it("cancelled não entra em recebível", () => {
    const snapshot = {
      amountCents: 10000,
      status: "cancelled" as const,
      payments: [],
    };

    expect(receivedCents(snapshot)).toBe(0);
    expect(remainingCents(snapshot)).toBe(0);
  });

  it("legado paid sem parcela conta o valor integral", () => {
    const snapshot = {
      amountCents: 8000,
      status: "paid" as const,
      payments: [],
    };

    expect(receivedCents(snapshot)).toBe(8000);
    expect(remainingCents(snapshot)).toBe(0);
  });

  it("pagamento cancelado não soma", () => {
    const snapshot = {
      amountCents: 10000,
      status: "pending" as const,
      payments: [payment({ amountCents: 4000, paymentMethod: "pix", cancelledAt: "2026-09-11T13:00:00Z" })],
    };

    expect(receivedCents(snapshot)).toBe(0);
    expect(remainingCents(snapshot)).toBe(10000);
  });
});

describe("overpayment", () => {
  it("rejeita R$101 quando remaining = R$100", () => {
    const snapshot = {
      amountCents: 10000,
      status: "pending" as const,
      payments: [],
    };

    expect(wouldOverpay(snapshot, 10100)).toBe(true);
    expect(wouldOverpay(snapshot, 10000)).toBe(false);
  });

  it("rejeita segundo pagamento acima do saldo", () => {
    const snapshot = {
      amountCents: 10000,
      status: "partially_paid" as const,
      payments: [payment({ amountCents: 3000, paymentMethod: "pix" })],
    };

    expect(wouldOverpay(snapshot, 7100)).toBe(true);
    expect(wouldOverpay(snapshot, 7000)).toBe(false);
  });
});

describe("filtro por forma de pagamento", () => {
  it("entry mista aparece em Pix e em dinheiro, sem duplicar id", () => {
    const entry = { id: "entry-1", paymentMethod: "cash" as const };
    const payments = [
      payment({ amountCents: 3000, paymentMethod: "pix" }),
      payment({ amountCents: 7000, paymentMethod: "cash" }),
    ];

    expect(entryMatchesPaymentMethodFilter(entry, payments, "pix")).toBe(true);
    expect(entryMatchesPaymentMethodFilter(entry, payments, "cash")).toBe(true);
    expect(entryMatchesPaymentMethodFilter(entry, payments, "credit_card")).toBe(false);
    expect(uniqueById([entry, entry])).toHaveLength(1);
  });

  it("legado paid sem parcela usa payment_method da entry", () => {
    const entry = { id: "legacy", paymentMethod: "pix" as const };
    expect(entryMatchesPaymentMethodFilter(entry, [], "pix")).toBe(true);
    expect(entryMatchesPaymentMethodFilter(entry, [], "cash")).toBe(false);
  });
});

describe("matriz de reabertura e cancelamento", () => {
  it("manual paid/partial pode reabrir; origens automáticas são bloqueadas", () => {
    expect(classifyReopen("manual", "paid").allowed).toBe(true);
    expect(classifyReopen("manual", "partially_paid").allowed).toBe(true);
    expect(classifyReopen("manual", "pending").allowed).toBe(false);
    expect(classifyReopen("service_order", "paid")).toEqual({
      allowed: false,
      error: "service_order_entry_not_reopenable",
    });
    expect(classifyReopen("service_package", "paid")).toEqual({
      allowed: false,
      error: "package_entry_not_reopenable",
    });
    expect(classifyReopen("sale", "paid")).toEqual({
      allowed: false,
      error: "sale_entry_not_reopenable",
    });
  });

  it("só manual pending sem dinheiro recebido pode cancelar", () => {
    expect(classifyCancel("manual", "pending", 0).allowed).toBe(true);
    expect(classifyCancel("manual", "partially_paid", 3000)).toEqual({
      allowed: false,
      error: "financial_entry_has_payments_requires_refund",
    });
    expect(classifyCancel("manual", "paid", 10000)).toEqual({
      allowed: false,
      error: "financial_entry_has_payments_requires_refund",
    });
    expect(classifyCancel("service_order", "pending", 0)).toEqual({
      allowed: false,
      error: "service_order_entry_not_cancellable",
    });
    expect(classifyCancel("service_package", "pending", 0)).toEqual({
      allowed: false,
      error: "package_entry_not_cancellable",
    });
    expect(classifyCancel("sale", "pending", 0)).toEqual({
      allowed: false,
      error: "sale_entry_not_cancellable",
    });
  });
});
