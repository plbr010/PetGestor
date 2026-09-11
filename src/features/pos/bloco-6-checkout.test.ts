import { describe, expect, it } from "vitest";

import {
  createCheckoutActor,
  PosCheckoutStore,
  type CatalogProduct,
  type CheckoutRequest,
} from "@/features/pos/checkout-engine";
import { settleCheckoutPayments } from "@/features/pos/cart-engine";
import { canCancelSale } from "@/features/pos/status";
import { getProfilePermissions, hasPermission, type MembershipAccess } from "@/lib/auth/permissions";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const PRODUCT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KEY_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function catalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: PRODUCT_A,
    companyId: COMPANY_A,
    name: "Ração Premium",
    salePriceCents: 5000,
    costPriceCents: 2000,
    currentStock: 10,
    trackStock: true,
    active: true,
    archivedAt: null,
    batches: [],
    ...overrides,
  };
}

function request(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    companyId: COMPANY_A,
    idempotencyKey: KEY_1,
    items: [{ productId: PRODUCT_A, quantity: 1, unitPriceCents: 5000 }],
    payments: [{ amountCents: 5000, paymentMethod: "pix", idempotencyKey: KEY_1 }],
    customerId: null,
    discount: { type: null, fixedCents: 0, percent: null },
    cashReceivedCents: null,
    ...overrides,
  };
}

function seededStore(stock = 10) {
  const store = new PosCheckoutStore();
  store.addProduct(catalogProduct({ currentStock: stock }));
  store.openCashSession(COMPANY_A);
  return store;
}

describe("BLOCO 6 — preço é autoridade do servidor", () => {
  it("produto oficial R$50 com cliente enviando R$0 vende por R$50", () => {
    const store = seededStore();
    const result = store.checkout(
      createCheckoutActor(COMPANY_A),
      request({ items: [{ productId: PRODUCT_A, quantity: 1, unitPriceCents: 0 }] }),
    );

    expect(result.ok).toBe(true);
    expect(store.sales[0]?.totalCents).toBe(5000);
    expect(store.saleItems[0]?.unitPriceCents).toBe(5000);
  });

  it("produto oficial R$50 com cliente enviando R$1 vende por R$50", () => {
    const store = seededStore();
    const result = store.checkout(
      createCheckoutActor(COMPANY_A),
      request({ items: [{ productId: PRODUCT_A, quantity: 1, unitPriceCents: 1 }] }),
    );

    expect(result.ok).toBe(true);
    expect(store.sales[0]?.totalCents).toBe(5000);
    expect(store.saleItems[0]?.unitPriceCents).toBe(5000);
  });

  it("produto de outra empresa é rejeitado sem revelar existência", () => {
    const store = seededStore();
    store.addProduct(catalogProduct({ id: PRODUCT_B, companyId: COMPANY_B, salePriceCents: 8000 }));

    const result = store.checkout(
      createCheckoutActor(COMPANY_A),
      request({ items: [{ productId: PRODUCT_B, quantity: 1, unitPriceCents: 1 }] }),
    );

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(store.sales).toHaveLength(0);
  });
});

describe("BLOCO 6 — idempotência", () => {
  it("mesma key sequencial gera 1 sale", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A);
    const first = store.checkout(actor, request());
    const second = store.checkout(actor, request());

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.saleId).toBe(first.saleId);
      expect(second.created).toBe(false);
    }
    expect(store.sales).toHaveLength(1);
    expect(store.saleItems).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.movements).toHaveLength(1);
    expect(store.entries).toHaveLength(1);
  });

  it("retry após timeout não duplica receita nem estoque", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A);
    store.checkout(actor, request());
    const retry = store.checkout(actor, request());

    expect(retry.ok).toBe(true);
    expect(store.sales).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(9);
  });

  it("duas chamadas simultâneas com a mesma key geram 1 sale", () => {
    const store = seededStore();
    const raced = store.checkoutConcurrent(
      createCheckoutActor(COMPANY_A),
      request(),
      request(),
    );

    expect(raced.first.ok && raced.second.ok).toBe(true);
    expect(store.sales).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
  });

  it("mesma key + carrinho diferente gera conflito", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A);
    store.checkout(actor, request());
    const conflict = store.checkout(
      actor,
      request({
        items: [{ productId: PRODUCT_A, quantity: 2, unitPriceCents: 5000 }],
        payments: [{ amountCents: 10000, paymentMethod: "pix", idempotencyKey: KEY_1 }],
      }),
    );

    expect(conflict).toEqual({ ok: false, error: "idempotency_key_conflict" });
    expect(store.sales).toHaveLength(1);
  });

  it("keys diferentes geram duas vendas intencionais", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A);
    store.checkout(actor, request());
    store.checkout(actor, request({ idempotencyKey: KEY_2, payments: [
      { amountCents: 5000, paymentMethod: "pix", idempotencyKey: KEY_2 },
    ] }));

    expect(store.sales).toHaveLength(2);
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(8);
  });
});

describe("BLOCO 6 — rollback atômico", () => {
  const steps = ["sale", "items", "stock", "financial_entry", "payment"] as const;

  for (const step of steps) {
    it(`falha após ${step} não deixa estado parcial`, () => {
      const store = seededStore();
      store.failAfter = step;
      const result = store.checkout(createCheckoutActor(COMPANY_A), request());

      expect(result).toEqual({ ok: false, error: "checkout_aborted" });
      expect(store.sales).toHaveLength(0);
      expect(store.saleItems).toHaveLength(0);
      expect(store.entries).toHaveLength(0);
      expect(store.payments).toHaveLength(0);
      expect(store.movements).toHaveLength(0);
      expect(store.products.get(PRODUCT_A)?.currentStock).toBe(10);
    });
  }
});

describe("BLOCO 6 — estoque concorrente", () => {
  it("estoque 1: uma venda conclui, a outra falha, saldo final 0", () => {
    const store = seededStore(1);
    const actor = createCheckoutActor(COMPANY_A);
    const raced = store.checkoutConcurrent(
      actor,
      request(),
      request({
        idempotencyKey: KEY_2,
        payments: [{ amountCents: 5000, paymentMethod: "pix", idempotencyKey: KEY_2 }],
      }),
    );

    const outcomes = [raced.first, raced.second];
    expect(outcomes.filter((row) => row.ok)).toHaveLength(1);
    expect(outcomes.filter((row) => !row.ok && !row.ok && "error" in row && row.error === "insufficient_stock")).toHaveLength(1);
    expect(store.sales).toHaveLength(1);
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(0);
    expect(store.products.get(PRODUCT_A)?.currentStock).toBeGreaterThanOrEqual(0);
  });
});

describe("BLOCO 6 hardening — checkout não vende lote só vencido", () => {
  it("currentStock 10 todo vencido bloqueia a venda", () => {
    const store = seededStore();
    store.today = "2026-09-11";
    store.addProduct(
      catalogProduct({
        currentStock: 10,
        batches: [
          {
            id: "b1",
            batchCode: "V1",
            quantityRemaining: 10,
            expirationDate: "2026-09-10",
            unitCostCents: 2000,
          },
        ],
      }),
    );

    const result = store.checkout(createCheckoutActor(COMPANY_A), request());
    expect(result).toEqual({ ok: false, error: "insufficient_stock" });
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(10);
  });

  it("lote que vence hoje ainda vende", () => {
    const store = seededStore();
    store.today = "2026-09-11";
    store.addProduct(
      catalogProduct({
        currentStock: 10,
        batches: [
          {
            id: "b1",
            batchCode: "H1",
            quantityRemaining: 10,
            expirationDate: "2026-09-11",
            unitCostCents: 2000,
          },
        ],
      }),
    );

    const result = store.checkout(createCheckoutActor(COMPANY_A), request());
    expect(result.ok).toBe(true);
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(9);
  });
});

describe("BLOCO 6 — troco e pagamento misto", () => {
  it("venda R$100, cash received R$120 → payment cash R$100 e troco R$20", () => {
    const store = seededStore();
    store.addProduct(catalogProduct({ salePriceCents: 10000, currentStock: 10 }));
    const result = store.checkout(
      createCheckoutActor(COMPANY_A),
      request({
        items: [{ productId: PRODUCT_A, quantity: 1 }],
        payments: [{ amountCents: 12000, paymentMethod: "cash", idempotencyKey: KEY_1 }],
        cashReceivedCents: 12000,
      }),
    );

    expect(result.ok).toBe(true);
    expect(store.sales[0]?.totalCents).toBe(10000);
    expect(store.payments).toEqual([
      expect.objectContaining({ paymentMethod: "cash", amountCents: 10000 }),
    ]);
    expect(store.sales[0]?.cashReceivedCents).toBe(12000);
    expect(store.sales[0]?.changeCents).toBe(2000);
    expect(store.entries[0]?.amountCents).toBe(10000);
  });

  it("Pix R$30 + cash received R$100 em venda R$100 → cash payment R$70 e troco R$30", () => {
    const store = seededStore();
    store.addProduct(catalogProduct({ salePriceCents: 10000 }));
    store.checkout(
      createCheckoutActor(COMPANY_A),
      request({
        items: [{ productId: PRODUCT_A, quantity: 1 }],
        payments: [
          { amountCents: 3000, paymentMethod: "pix", idempotencyKey: "pix-1" },
          { amountCents: 10000, paymentMethod: "cash", idempotencyKey: "cash-1" },
        ],
        cashReceivedCents: 10000,
      }),
    );

    expect(store.payments.map((payment) => [payment.paymentMethod, payment.amountCents])).toEqual([
      ["pix", 3000],
      ["cash", 7000],
    ]);
    expect(store.sales[0]?.cashReceivedCents).toBe(10000);
    expect(store.sales[0]?.changeCents).toBe(3000);
    expect(store.payments.reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(10000);
  });

  it("sem pagamento em dinheiro → troco 0", () => {
    const settled = settleCheckoutPayments(
      10000,
      [{ amountCents: 10000, paymentMethod: "pix", idempotencyKey: KEY_1 }],
      12000,
    );
    expect(settled.ok).toBe(true);
    if (settled.ok) {
      expect(settled.value.changeCents).toBe(0);
      expect(settled.value.appliedCashCents).toBe(0);
    }
  });
});

describe("BLOCO 6 — cancelamento e caixa", () => {
  it("venda paga não cancela estoque nem payment", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A, {
      permissions: ["pos.use", "pos.cancel_sale", "pos.receive_payment"],
    });
    const created = store.checkout(actor, request());
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const cancelled = store.cancelSale(actor, created.saleId);
    expect(cancelled).toEqual({ ok: false, error: "sale_paid_requires_refund" });
    expect(store.sales[0]?.status).toBe("completed");
    expect(store.payments[0]?.cancelledAt).toBeNull();
    expect(store.products.get(PRODUCT_A)?.currentStock).toBe(9);
    expect(canCancelSale("completed", null)).toBe(false);
  });

  it("dinheiro sem caixa aberto é rejeitado no servidor", () => {
    const store = new PosCheckoutStore();
    store.addProduct(catalogProduct());
    const result = store.checkout(
      createCheckoutActor(COMPANY_A),
      request({
        payments: [{ amountCents: 5000, paymentMethod: "cash", idempotencyKey: KEY_1 }],
        cashReceivedCents: 5000,
      }),
    );
    expect(result).toEqual({ ok: false, error: "cash_session_required" });
  });

  it("retry não duplica payment nem movimento de caixa", () => {
    const store = seededStore();
    const actor = createCheckoutActor(COMPANY_A);
    const payload = request({
      payments: [{ amountCents: 5000, paymentMethod: "cash", idempotencyKey: KEY_1 }],
      cashReceivedCents: 5000,
    });
    store.checkout(actor, payload);
    store.checkout(actor, payload);

    expect(store.payments).toHaveLength(1);
    expect(store.sales).toHaveLength(1);
    expect(store.cashSessions).toHaveLength(1);
  });
});

describe("BLOCO 6 — segurança", () => {
  it("staff com pos.use conclui a venda", () => {
    const store = seededStore();
    const result = store.checkout(createCheckoutActor(COMPANY_A), request());
    expect(result.ok).toBe(true);
  });

  it("staff sem pos.use é rejeitado", () => {
    const store = seededStore();
    const result = store.checkout(
      createCheckoutActor(COMPANY_A, { permissions: ["pos.receive_payment"] }),
      request(),
    );
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("staff revogado é rejeitado", () => {
    const store = seededStore();
    const result = store.checkout(
      createCheckoutActor(COMPANY_A, { accessRevokedAt: "2026-09-11T12:00:00.000Z" }),
      request(),
    );
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("desconto exige pos.apply_discount no servidor", () => {
    const store = seededStore();
    const result = store.checkout(
      createCheckoutActor(COMPANY_A, { permissions: ["pos.use"] }),
      request({
        discount: { type: "fixed", fixedCents: 1000, percent: null },
        payments: [{ amountCents: 4000, paymentMethod: "pix", idempotencyKey: KEY_1 }],
      }),
    );
    expect(result).toEqual({ ok: false, error: "discount_permission_required" });
  });

  it("Server Action de checkout continua exigindo permissão mínima", () => {
    const reception: MembershipAccess = {
      role: "staff",
      accessProfile: "reception",
      permissions: [...getProfilePermissions("reception")],
      accessRevokedAt: null,
      employeeId: "emp-1",
      ownScheduleOnly: false,
    };

    expect(hasPermission(reception, "pos.use")).toBe(true);
    expect(hasPermission(reception, "pos.apply_discount")).toBe(false);
    expect(hasPermission(reception, "pos.cancel_sale")).toBe(false);
  });
});
