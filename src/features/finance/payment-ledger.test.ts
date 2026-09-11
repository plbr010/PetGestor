import { describe, expect, it } from "vitest";

import { receivedCents, remainingCents } from "@/features/finance/ledger";
import {
  applyConcurrentPayments,
  cancelEntry,
  createPaymentStore,
  registerFinancialPayment,
  reopenEntry,
  type LedgerEntry,
  type PaymentStore,
} from "@/features/finance/payment-ledger";

const KEY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function seedEntry(
  store: PaymentStore,
  overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "sourceType">,
): LedgerEntry {
  const entry: LedgerEntry = {
    companyId: "company-a",
    status: "pending",
    amountCents: 10000,
    paymentMethod: null,
    paidAt: null,
    packageId: null,
    ...overrides,
  };
  store.entries.push(entry);
  return entry;
}

describe("pagamento parcial e misto", () => {
  it("R$100 + R$30 → partially_paid remaining R$70; +R$70 → paid", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });

    const first = registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 3000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });
    expect(first).toEqual({ ok: true, entryId: "e1", idempotent: false });
    expect(store.entries[0]?.status).toBe("partially_paid");
    expect(receivedCents({
      amountCents: 10000,
      status: store.entries[0]!.status,
      payments: store.payments,
    })).toBe(3000);
    expect(remainingCents({
      amountCents: 10000,
      status: store.entries[0]!.status,
      payments: store.payments,
    })).toBe(7000);

    const second = registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 7000,
      paymentMethod: "cash",
      idempotencyKey: KEY_B,
    });
    expect(second.ok).toBe(true);
    expect(store.entries[0]?.status).toBe("paid");
    expect(remainingCents({
      amountCents: 10000,
      status: store.entries[0]!.status,
      payments: store.payments,
    })).toBe(0);
  });

  it("R$30 Pix + R$70 dinheiro = paid R$100", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "mixed", sourceType: "manual" });

    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "mixed",
      amountCents: 3000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });
    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "mixed",
      amountCents: 7000,
      paymentMethod: "cash",
      idempotencyKey: KEY_B,
    });

    expect(store.entries[0]?.status).toBe("paid");
    expect(store.payments.map((payment) => payment.paymentMethod)).toEqual(["pix", "cash"]);
    expect(store.payments.reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(10000);
  });

  it("R$101 quando remaining = R$100 é rejeitado", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });

    expect(
      registerFinancialPayment(store, {
        companyId: "company-a",
        entryId: "e1",
        amountCents: 10100,
        paymentMethod: "pix",
        idempotencyKey: KEY_A,
      }),
    ).toEqual({ ok: false, error: "payment_exceeds_balance" });
    expect(store.payments).toHaveLength(0);
    expect(store.entries[0]?.status).toBe("pending");
  });
});

describe("concorrência e idempotência", () => {
  it("duas chamadas de R$70 em saldo R$100: só uma combinação válida", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });

    const result = applyConcurrentPayments(
      store,
      {
        companyId: "company-a",
        entryId: "e1",
        amountCents: 7000,
        paymentMethod: "pix",
        idempotencyKey: KEY_A,
      },
      {
        companyId: "company-a",
        entryId: "e1",
        amountCents: 7000,
        paymentMethod: "cash",
        idempotencyKey: KEY_B,
      },
    );

    expect(result.first.ok).toBe(true);
    expect(result.second).toEqual({ ok: false, error: "payment_exceeds_balance" });
    const total = store.payments
      .filter((payment) => payment.cancelledAt == null)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    expect(total).toBe(7000);
    expect(total).toBeLessThanOrEqual(10000);
  });

  it("retry com a mesma idempotency_key não duplica", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });
    const input = {
      companyId: "company-a" as const,
      entryId: "e1",
      amountCents: 4000,
      paymentMethod: "pix" as const,
      idempotencyKey: KEY_A,
    };

    const first = registerFinancialPayment(store, input);
    const retry = registerFinancialPayment(store, input);

    expect(first).toEqual({ ok: true, entryId: "e1", idempotent: false });
    expect(retry).toEqual({ ok: true, entryId: "e1", idempotent: true });
    expect(store.payments).toHaveLength(1);
  });

  it("chave nova é tentativa intencional", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });

    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 4000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });
    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 4000,
      paymentMethod: "cash",
      idempotencyKey: KEY_B,
    });

    expect(store.payments).toHaveLength(2);
  });

  it("empresa B não opera lançamento da empresa A", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual", companyId: "company-a" });

    expect(
      registerFinancialPayment(store, {
        companyId: "company-b",
        entryId: "e1",
        amountCents: 10000,
        paymentMethod: "pix",
        idempotencyKey: KEY_A,
      }),
    ).toEqual({ ok: false, error: "financial_entry_not_found" });
  });
});

describe("reabertura e cancelamento", () => {
  it("manual paid cancela pagamentos de forma auditável e volta a pending", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });
    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 10000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });

    expect(reopenEntry(store, "company-a", "e1")).toEqual({ ok: true });
    expect(store.entries[0]?.status).toBe("pending");
    expect(store.payments[0]?.cancelledAt).not.toBeNull();
    expect(store.payments).toHaveLength(1);
  });

  it("manual partially_paid também reconcilia pagamentos", () => {
    const store = createPaymentStore();
    seedEntry(store, { id: "e1", sourceType: "manual" });
    registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "e1",
      amountCents: 3000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });

    expect(reopenEntry(store, "company-a", "e1")).toEqual({ ok: true });
    expect(store.entries[0]?.status).toBe("pending");
    expect(store.payments.every((payment) => payment.cancelledAt != null)).toBe(true);
  });

  it("service_order, service_package e sale não reabrem", () => {
    for (const sourceType of ["service_order", "service_package", "sale"] as const) {
      const store = createPaymentStore();
      seedEntry(store, { id: sourceType, sourceType, status: "paid" });
      const result = reopenEntry(store, "company-a", sourceType);
      expect(result.ok).toBe(false);
      expect(store.entries[0]?.status).toBe("paid");
    }
  });

  it("manual pending cancela; paid/partial bloqueiam sem refund", () => {
    const pendingStore = createPaymentStore();
    seedEntry(pendingStore, { id: "pending", sourceType: "manual" });
    expect(cancelEntry(pendingStore, "company-a", "pending")).toEqual({ ok: true });
    expect(pendingStore.entries[0]?.status).toBe("cancelled");

    const paidStore = createPaymentStore();
    seedEntry(paidStore, { id: "paid", sourceType: "manual" });
    registerFinancialPayment(paidStore, {
      companyId: "company-a",
      entryId: "paid",
      amountCents: 10000,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });
    expect(cancelEntry(paidStore, "company-a", "paid")).toEqual({
      ok: false,
      error: "financial_entry_has_payments_requires_refund",
    });
  });
});

describe("pacote pending → paid (regressão BLOCO 4)", () => {
  it("pagamento integral ativa o mesmo pacote, sem recriar receita", () => {
    const store = createPaymentStore();
    seedEntry(store, {
      id: "fe-pkg",
      sourceType: "service_package",
      packageId: "pkg-1",
    });
    store.packages.push({ id: "pkg-1", financialStatus: "pending" });

    const result = registerFinancialPayment(store, {
      companyId: "company-a",
      entryId: "fe-pkg",
      amountCents: null,
      paymentMethod: "pix",
      idempotencyKey: KEY_A,
    });

    expect(result).toEqual({ ok: true, entryId: "fe-pkg", idempotent: false });
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]?.status).toBe("paid");
    expect(store.packages).toHaveLength(1);
    expect(store.packages[0]?.financialStatus).toBe("paid");
  });
});
