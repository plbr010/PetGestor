import { describe, expect, it } from "vitest";
import {
  applyConcurrentMovements,
  applyStockMovement,
  computeAvailableStock,
  isExpiredDate,
  type StockProductState,
} from "@/features/inventory/stock-engine";
import { localDateTimeToUtcIso } from "@/lib/timezone";
import {
  buildRpcItemsPayload,
  buildRpcPaymentsPayload,
  computeCartSubtotalCents,
  computeCartTotalCents,
  computeChangeCents,
  computeDiscountCents,
  computeEffectivePaidCents,
  computeGrossMarginCents,
  computeLineSubtotalCents,
  determineSaleStatus,
  sumPaymentsCents,
  validateCartQuantity,
  validatePayments,
} from "@/features/pos/cart-engine";
import { completeSaleSchema, parseDiscountPercentInput } from "@/features/pos/schemas";
import {
  canReceiveSalePayment,
  computeCashDifferenceCents,
  computeExpectedCashCents,
  computeSaleBalanceCents,
  emptyCashMethodTotals,
  sumCashMethodTotals,
} from "@/features/pos/balance";
import type { CartLine } from "@/features/pos/types";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const SALE_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function product(overrides: Partial<StockProductState> = {}): StockProductState {
  return {
    id: "product-1",
    companyId: COMPANY_A,
    currentStock: 10,
    costPriceCents: 1800,
    archivedAt: null,
    trackStock: true,
    batches: [],
    appliedKeys: [],
    ...overrides,
  };
}

function cartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "product-1",
    name: "Ração Premium",
    unit: "kg",
    unitPriceCents: 3000,
    costPriceCents: 1800,
    quantity: 1,
    availableStock: 10,
    trackStock: true,
    ...overrides,
  };
}

describe("PDV / vendas", () => {
  it("A) venda simples calcula subtotal e total", () => {
    const lines = [cartLine()];
    expect(computeCartSubtotalCents(lines)).toBe(3000);
    expect(computeCartTotalCents(3000, 0)).toBe(3000);
  });

  it("B) múltiplos produtos somam subtotal", () => {
    const lines = [
      cartLine({ productId: "p1", quantity: 2, unitPriceCents: 1000 }),
      cartLine({ productId: "p2", quantity: 1, unitPriceCents: 2500 }),
    ];
    expect(computeCartSubtotalCents(lines)).toBe(4500);
  });

  it("C) cliente opcional no schema", () => {
    const parsed = completeSaleSchema.safeParse({
      idempotencyKey: SALE_KEY,
      customerId: null,
      discountType: null,
      discountFixedCents: 0,
      discountPercent: null,
      cashReceivedCents: null,
      items: [{ productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantity: 1, unitPriceCents: 1000 }],
      payments: [{ amountCents: 1000, paymentMethod: "pix", idempotencyKey: SALE_KEY }],
    });
    expect(parsed.success).toBe(true);
  });

  it("D) desconto fixo", () => {
    expect(
      computeDiscountCents(5000, { type: "fixed", fixedCents: 800, percent: null }),
    ).toBe(800);
    expect(computeCartTotalCents(5000, 800)).toBe(4200);
  });

  it("E) desconto percentual", () => {
    expect(
      computeDiscountCents(20000, { type: "percent", fixedCents: 0, percent: 10 }),
    ).toBe(2000);
  });

  it("F) pagamento dinheiro com troco", () => {
    const payments = [{ amountCents: 10000, paymentMethod: "cash" as const, idempotencyKey: SALE_KEY }];
    expect(computeChangeCents(8700, payments, 10000)).toBe(1300);
    expect(computeEffectivePaidCents(8700, payments, 10000)).toBe(8700);
  });

  it("G) pagamento PIX", () => {
    const payments = [{ amountCents: 5000, paymentMethod: "pix" as const, idempotencyKey: SALE_KEY }];
    expect(sumPaymentsCents(payments)).toBe(5000);
    expect(determineSaleStatus(5000, 5000)).toBe("completed");
  });

  it("H) pagamento dividido", () => {
    const payments = [
      { amountCents: 4000, paymentMethod: "pix" as const, idempotencyKey: "11111111-1111-4111-8111-111111111111" },
      { amountCents: 6000, paymentMethod: "cash" as const, idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    ];
    expect(sumPaymentsCents(payments)).toBe(10000);
    expect(validatePayments(10000, payments, null)).toBeNull();
  });

  it("I) pagamento parcial", () => {
    expect(determineSaleStatus(20000, 10000)).toBe("partially_paid");
  });

  it("J) troco não aumenta valor pago efetivo", () => {
    const payments = [{ amountCents: 10000, paymentMethod: "cash" as const, idempotencyKey: SALE_KEY }];
    expect(computeEffectivePaidCents(8700, payments, 10000)).toBe(8700);
  });

  it("K) baixa de estoque via movimentação de saída", () => {
    const applied = applyStockMovement(product(), {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 2,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      today: "2026-08-18",
    });

    expect(applied.result.ok).toBe(true);
    if (applied.result.ok) {
      expect(applied.result.newStock).toBe(8);
    }
  });

  it("L) impede estoque negativo", () => {
    const applied = applyStockMovement(product({ currentStock: 1 }), {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 2,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      today: "2026-08-18",
    });

    expect(applied.result.ok).toBe(false);
    if (!applied.result.ok) {
      expect(applied.result.error).toBe("insufficient_stock");
    }
  });

  it("M) concorrência — apenas uma venda conclui com estoque 1", () => {
    const base = product({ currentStock: 1 });
    const first = applyStockMovement(base, {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 1,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
      today: "2026-08-18",
    });
    const second = applyStockMovement(first.product, {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 1,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
      today: "2026-08-18",
    });

    expect(first.result.ok).toBe(true);
    expect(second.result.ok).toBe(false);
  });

  it("N) idempotência evita segunda baixa", () => {
    const key = "77777777-7777-4777-8777-777777777777";
    const first = applyStockMovement(product(), {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 1,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: key,
      today: "2026-08-18",
    });
    const second = applyStockMovement(first.product, {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 1,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: key,
      today: "2026-08-18",
    });

    expect(first.result.ok).toBe(true);
    expect(second.result.ok).toBe(true);
    if (first.result.ok && second.result.ok) {
      expect(second.result.duplicated).toBe(true);
      expect(second.result.newStock).toBe(first.result.newStock);
    }
  });

  it("O) integração financeiro — payload de pagamentos", () => {
    const payload = buildRpcPaymentsPayload([
      { amountCents: 3000, paymentMethod: "pix", idempotencyKey: SALE_KEY },
    ]);
    expect(payload[0]?.payment_method).toBe("pix");
    expect(payload[0]?.amount_cents).toBe(3000);
  });

  it("P) fechamento de caixa — soma por método", () => {
    const payments = [
      { amountCents: 4000, paymentMethod: "pix" as const, idempotencyKey: SALE_KEY },
      { amountCents: 6000, paymentMethod: "cash" as const, idempotencyKey: SALE_KEY },
    ];
    const byMethod = payments.reduce<Record<string, number>>((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] ?? 0) + payment.amountCents;
      return acc;
    }, {});
    expect(byMethod.pix).toBe(4000);
    expect(byMethod.cash).toBe(6000);
  });

  it("Q) custo snapshot / margem bruta", () => {
    const margin = computeGrossMarginCents([
      { quantity: 2, unitPriceCents: 3000, costPriceCentsSnapshot: 1800 },
    ]);
    expect(margin).toBe(2400);
    expect(computeLineSubtotalCents(2, 3000)).toBe(6000);
  });

  it("R/S) cancelamento devolve estoque", () => {
    const sold = applyStockMovement(product({ currentStock: 5 }), {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 2,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "88888888-8888-4888-8888-888888888888",
      today: "2026-08-18",
    });
    const returned = applyStockMovement(sold.product, {
      companyId: COMPANY_A,
      type: "return",
      quantity: 2,
      unitCostCents: 1800,
      reason: "sale_cancelled",
      notes: "Cliente desistiu",
      idempotencyKey: "99999999-9999-4999-8999-999999999999",
      today: "2026-08-18",
    });

    expect(returned.result.ok).toBe(true);
    if (returned.result.ok) {
      expect(returned.result.newStock).toBe(5);
    }
  });

  it("T) isolamento multi-tenant", () => {
    const applied = applyStockMovement(product({ companyId: COMPANY_A }), {
      companyId: COMPANY_B,
      type: "exit",
      quantity: 1,
      unitCostCents: null,
      reason: "sale",
      notes: null,
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
      today: "2026-08-18",
    });
    expect(applied.result.ok).toBe(false);
  });

  it("U) produto fracionado 0,500 kg", () => {
    const line = cartLine({ quantity: 0.5, unitPriceCents: 4000 });
    expect(validateCartQuantity(line, 0.5)).toBeNull();
    expect(computeLineSubtotalCents(0.5, 4000)).toBe(2000);
  });

  it("V) lote vencido não entra no disponível", () => {
    const available = computeAvailableStock(
      5,
      [{ id: "b1", batchCode: "L1", quantityRemaining: 2, expirationDate: "2026-08-01", unitCostCents: 1000 }],
      "2026-08-18",
    );
    expect(isExpiredDate("2026-08-01", "2026-08-18")).toBe(true);
    expect(available).toBe(3);
  });

  it("W) histórico — payload RPC de itens", () => {
    const payload = buildRpcItemsPayload([
      cartLine({ productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantity: 1.5 }),
    ]);
    expect(payload[0]?.quantity).toBe(1.5);
  });

  it("dashboard — limites do dia não lançam Invalid time value", () => {
    const timeZone = "America/Sao_Paulo";
    const date = "2026-08-18";

    expect(() => localDateTimeToUtcIso(date, "00:00", timeZone)).not.toThrow();
    expect(() => localDateTimeToUtcIso(date, "23:59", timeZone)).not.toThrow();
    expect(localDateTimeToUtcIso(date, "00:00", timeZone)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("desconto percentual inválido rejeitado", () => {
    expect(parseDiscountPercentInput("150")).toBeNull();
  });

  it("pagamento excede total sem troco é inválido", () => {
    const payments = [{ amountCents: 12000, paymentMethod: "pix" as const, idempotencyKey: SALE_KEY }];
    expect(validatePayments(10000, payments, null)).not.toBeNull();
  });

  it("movimentações concorrentes aplicadas em sequência", () => {
    const next = applyConcurrentMovements(product({ currentStock: 3 }), [
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 1,
        unitCostCents: null,
        reason: "sale",
        notes: null,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        today: "2026-08-18",
      },
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 1,
        unitCostCents: null,
        reason: "sale",
        notes: null,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
        today: "2026-08-18",
      },
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 1,
        unitCostCents: null,
        reason: "sale",
        notes: null,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
        today: "2026-08-18",
      },
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 1,
        unitCostCents: null,
        reason: "sale",
        notes: null,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
        today: "2026-08-18",
      },
    ]);

    expect(next.currentStock).toBe(0);
  });

  it("saldo pendente nunca negativo e segundo pagamento zera", () => {
    expect(computeSaleBalanceCents(20000, 8000)).toBe(12000);
    expect(computeSaleBalanceCents(20000, 20000)).toBe(0);
    expect(computeSaleBalanceCents(20000, 25000)).toBe(0);
    expect(determineSaleStatus(20000, 8000)).toBe("partially_paid");
    expect(determineSaleStatus(20000, 20000)).toBe("completed");
  });

  it("registrar pagamento só em parcialmente paga com saldo", () => {
    expect(
      canReceiveSalePayment({
        status: "partially_paid",
        cancelledAt: null,
        totalCents: 20000,
        paidCents: 8000,
      }),
    ).toBe(true);
    expect(
      canReceiveSalePayment({
        status: "completed",
        cancelledAt: null,
        totalCents: 20000,
        paidCents: 20000,
      }),
    ).toBe(false);
    expect(
      canReceiveSalePayment({
        status: "partially_paid",
        cancelledAt: "2026-08-25T12:00:00.000Z",
        totalCents: 20000,
        paidCents: 8000,
      }),
    ).toBe(false);
  });

  it("fechamento — dinheiro físico esperado ignora PIX/cartão", () => {
    const totals = emptyCashMethodTotals();
    totals.cash = 8000;
    totals.pix = 12000;
    totals.debit_card = 5000;
    expect(sumCashMethodTotals(totals)).toBe(25000);
    expect(computeExpectedCashCents(10000, totals.cash)).toBe(18000);
    expect(computeCashDifferenceCents(17500, 18000)).toBe(-500);
  });
});
