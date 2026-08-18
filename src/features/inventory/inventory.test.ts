import { describe, expect, it } from "vitest";

import { matchesProductFilters, sortMovementsByRecent } from "@/features/inventory/filters";
import {
  applyConcurrentMovements,
  applyStockMovement,
  computeAvailableStock,
  computeExpiredQuantity,
  computeWeightedAverageCostCents,
  getStockStatus,
  isExpiredDate,
  isExpiringSoon,
  parseQuantityInput,
  type StockProductState,
} from "@/features/inventory/stock-engine";
import { categoryFormSchema, productFormSchema, supplierFormSchema } from "@/features/inventory/schemas";
import { DEFAULT_PRODUCT_CATEGORY_NAMES } from "@/features/inventory/units";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

function product(overrides: Partial<StockProductState> = {}): StockProductState {
  return {
    id: "product-1",
    companyId: COMPANY_A,
    currentStock: 10,
    costPriceCents: 1000,
    archivedAt: null,
    trackStock: true,
    batches: [],
    appliedKeys: [],
    ...overrides,
  };
}

describe("produtos e categorias", () => {
  it("A) cria produto com campos obrigatórios", () => {
    const parsed = productFormSchema.safeParse({
      name: "Shampoo Neutro",
      sku: "SH-01",
      barcode: null,
      categoryId: null,
      description: null,
      unit: "ml",
      costPriceCents: 850,
      salePriceCents: 1990,
      minimumStock: 20,
      active: true,
      trackStock: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("B) edita produto validando nome e unidade", () => {
    const parsed = productFormSchema.safeParse({
      name: "Shampoo Premium",
      sku: null,
      barcode: null,
      categoryId: null,
      description: "Uso interno",
      unit: "l",
      costPriceCents: 1200,
      salePriceCents: null,
      minimumStock: 5,
      active: true,
      trackStock: true,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unit).toBe("l");
      expect(parsed.data.salePriceCents).toBeNull();
    }
  });

  it("C/T) produto arquivado não recebe movimentação", () => {
    const result = applyStockMovement(product({ archivedAt: "2026-08-18T10:00:00.000Z" }), {
      companyId: COMPANY_A,
      type: "entry",
      quantity: 5,
      unitCostCents: 1000,
      reason: null,
      notes: null,
      idempotencyKey: "key-archived",
    });

    expect(result.result.ok).toBe(false);
    if (!result.result.ok) {
      expect(result.result.error).toBe("archived_product");
    }
  });

  it("D) cria categoria com nome válido e lista padrão por empresa", () => {
    const parsed = categoryFormSchema.safeParse({ name: "Higiene" });
    expect(parsed.success).toBe(true);
    expect(DEFAULT_PRODUCT_CATEGORY_NAMES).toContain("Higiene");
    expect(DEFAULT_PRODUCT_CATEGORY_NAMES).toContain("Ração");
  });
});

describe("movimentações de estoque", () => {
  it("E) entrada aumenta saldo e registra histórico lógico", () => {
    const applied = applyStockMovement(product({ currentStock: 0, costPriceCents: 0 }), {
      companyId: COMPANY_A,
      type: "entry",
      quantity: 20,
      unitCostCents: 850,
      reason: null,
      notes: "Compra",
      idempotencyKey: "entry-1",
    });

    expect(applied.result.ok).toBe(true);
    if (applied.result.ok) {
      expect(applied.result.duplicated).toBe(false);
      expect(applied.result.previousStock).toBe(0);
      expect(applied.result.newStock).toBe(20);
      expect(applied.product.costPriceCents).toBe(850);
      expect(applied.product.appliedKeys).toContain("entry-1");
    }
  });

  it("F) saída de uso interno reduz o saldo", () => {
    const applied = applyStockMovement(product(), {
      companyId: COMPANY_A,
      type: "internal_use",
      quantity: 2,
      unitCostCents: null,
      reason: "internal_use",
      notes: null,
      idempotencyKey: "exit-1",
    });

    expect(applied.result.ok).toBe(true);
    if (applied.result.ok) {
      expect(applied.result.newStock).toBe(8);
    }
  });

  it("G) ajuste usa a diferença da contagem física", () => {
    const applied = applyStockMovement(product({ currentStock: 10 }), {
      companyId: COMPANY_A,
      type: "adjustment",
      quantity: 0,
      countedStock: 8,
      unitCostCents: null,
      reason: "adjustment",
      notes: "Inventário",
      idempotencyKey: "adj-1",
    });

    expect(applied.result.ok).toBe(true);
    if (applied.result.ok) {
      expect(applied.result.previousStock).toBe(10);
      expect(applied.result.newStock).toBe(8);
    }
  });

  it("H) impede saldo negativo", () => {
    const applied = applyStockMovement(product({ currentStock: 3 }), {
      companyId: COMPANY_A,
      type: "exit",
      quantity: 5,
      unitCostCents: null,
      reason: "damage",
      notes: null,
      idempotencyKey: "neg-1",
    });

    expect(applied.result.ok).toBe(false);
    if (!applied.result.ok) {
      expect(applied.result.error).toBe("insufficient_stock");
    }
    expect(applied.product.currentStock).toBe(3);
  });

  it("I) estoque mínimo gera status baixo", () => {
    expect(
      getStockStatus({
        currentStock: 5,
        minimumStock: 5,
        archivedAt: null,
        trackStock: true,
      }),
    ).toBe("low");
  });

  it("J) current_stock zero gera sem estoque", () => {
    expect(
      getStockStatus({
        currentStock: 0,
        minimumStock: 2,
        archivedAt: null,
        trackStock: true,
      }),
    ).toBe("out");
  });

  it("K) custo médio ponderado preserva histórico anterior no cálculo", () => {
    expect(computeWeightedAverageCostCents(10, 1000, 10, 2000)).toBe(1500);
    expect(computeWeightedAverageCostCents(0, 1000, 10, 2000)).toBe(2000);

    const first = applyStockMovement(product({ currentStock: 10, costPriceCents: 1000 }), {
      companyId: COMPANY_A,
      type: "entry",
      quantity: 10,
      unitCostCents: 2000,
      reason: null,
      notes: null,
      idempotencyKey: "avg-1",
    });

    expect(first.product.costPriceCents).toBe(1500);
    expect(first.result.ok && first.result.previousStock).toBe(10);
  });

  it("L) lotes acumulam quantidade na mesma chave lote+validade", () => {
    const first = applyStockMovement(product({ currentStock: 0, batches: [] }), {
      companyId: COMPANY_A,
      type: "entry",
      quantity: 5,
      unitCostCents: 800,
      reason: null,
      notes: null,
      idempotencyKey: "batch-1",
      batchCode: "L1",
      expirationDate: "2026-12-01",
    });

    const second = applyStockMovement(first.product, {
      companyId: COMPANY_A,
      type: "entry",
      quantity: 3,
      unitCostCents: 800,
      reason: null,
      notes: null,
      idempotencyKey: "batch-2",
      batchCode: "L1",
      expirationDate: "2026-12-01",
    });

    expect(second.product.batches).toHaveLength(1);
    expect(second.product.batches[0]?.quantityRemaining).toBe(8);
    expect(second.product.currentStock).toBe(8);
  });

  it("M) validade: vencido não fica disponível para saída comum", () => {
    const batches = [
      {
        id: "b1",
        batchCode: "V1",
        quantityRemaining: 5,
        expirationDate: "2026-01-01",
        unitCostCents: 1000,
      },
    ];

    expect(isExpiredDate("2026-01-01", "2026-08-18")).toBe(true);
    expect(isExpiringSoon("2026-09-01", "2026-08-18")).toBe(true);
    expect(computeExpiredQuantity(batches, "2026-08-18")).toBe(5);
    expect(computeAvailableStock(5, batches, "2026-08-18")).toBe(0);

    const denied = applyStockMovement(
      product({ currentStock: 5, batches }),
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 1,
        unitCostCents: null,
        reason: "internal_use",
        notes: null,
        idempotencyKey: "expired-exit",
        today: "2026-08-18",
      },
    );

    expect(denied.result.ok).toBe(false);

    const loss = applyStockMovement(product({ currentStock: 5, batches }), {
      companyId: COMPANY_A,
      type: "loss",
      quantity: 1,
      unitCostCents: null,
      reason: "expired",
      notes: "Vencido",
      idempotencyKey: "expired-loss",
      today: "2026-08-18",
    });

    expect(loss.result.ok).toBe(true);
    if (loss.result.ok) {
      expect(loss.result.newStock).toBe(4);
    }
  });

  it("N) fornecedor é validado no cadastro simples", () => {
    const parsed = supplierFormSchema.safeParse({
      name: "Pet Distribuidora",
      contactName: "Ana",
      phone: "11999998888",
      email: "ana@fornecedor.com",
      document: "12345678000199",
      notes: null,
      active: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("O) histórico fica do mais recente para o mais antigo", () => {
    const sorted = sortMovementsByRecent([
      { createdAt: "2026-08-17T17:10:00.000Z", type: "internal_use" },
      { createdAt: "2026-08-18T10:30:00.000Z", type: "entry" },
    ]);

    expect(sorted[0]?.type).toBe("entry");
    expect(sorted[1]?.type).toBe("internal_use");
  });

  it("P) concorrência serializada não corrompe o saldo", () => {
    const next = applyConcurrentMovements(product({ currentStock: 10 }), [
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 6,
        unitCostCents: null,
        reason: "internal_use",
        notes: null,
        idempotencyKey: "c1",
      },
      {
        companyId: COMPANY_A,
        type: "exit",
        quantity: 6,
        unitCostCents: null,
        reason: "internal_use",
        notes: null,
        idempotencyKey: "c2",
      },
    ]);

    expect(next.currentStock).toBe(4);
    expect(next.appliedKeys).toEqual(["c1"]);
  });

  it("Q) idempotência ignora a mesma chave", () => {
    const movement = {
      companyId: COMPANY_A,
      type: "entry" as const,
      quantity: 5,
      unitCostCents: 1000,
      reason: null,
      notes: null,
      idempotencyKey: "same-key",
    };

    const first = applyStockMovement(product({ currentStock: 10 }), movement);
    const second = applyStockMovement(first.product, movement);

    expect(first.product.currentStock).toBe(15);
    expect(second.result.ok).toBe(true);
    if (second.result.ok) {
      expect(second.result.duplicated).toBe(true);
      expect(second.result.newStock).toBe(15);
    }
  });

  it("R) isolamento multi-tenant rejeita empresa diferente", () => {
    const applied = applyStockMovement(product({ companyId: COMPANY_A }), {
      companyId: COMPANY_B,
      type: "entry",
      quantity: 1,
      unitCostCents: 100,
      reason: null,
      notes: null,
      idempotencyKey: "tenant",
    });

    expect(applied.result.ok).toBe(false);
    if (!applied.result.ok) {
      expect(applied.result.error).toBe("tenant_mismatch");
    }
    expect(applied.product.currentStock).toBe(10);
  });

  it("S) filtros de busca, categoria, baixo, zerado e arquivado", () => {
    const items = [
      {
        name: "Shampoo",
        sku: "SH-1",
        barcode: "789",
        categoryId: "cat-1",
        currentStock: 2,
        minimumStock: 5,
        trackStock: true,
        archivedAt: null,
      },
      {
        name: "Ração",
        sku: null,
        barcode: null,
        categoryId: "cat-2",
        currentStock: 0,
        minimumStock: 1,
        trackStock: true,
        archivedAt: null,
      },
      {
        name: "Toalha",
        sku: null,
        barcode: null,
        categoryId: "cat-1",
        currentStock: 10,
        minimumStock: 1,
        trackStock: true,
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
    ];

    expect(items.filter((item) => matchesProductFilters(item, { query: "sham" }))).toHaveLength(1);
    expect(
      items.filter((item) => matchesProductFilters(item, { categoryId: "cat-1", archive: "all" })),
    ).toHaveLength(2);
    expect(items.filter((item) => matchesProductFilters(item, { stock: "low" }))).toHaveLength(1);
    expect(items.filter((item) => matchesProductFilters(item, { stock: "out" }))).toHaveLength(1);
    expect(items.filter((item) => matchesProductFilters(item, { archive: "archived" }))).toHaveLength(
      1,
    );
    expect(
      items.filter((item) =>
        matchesProductFilters(item, { archive: "active", stock: "all", query: "" }),
      ),
    ).toHaveLength(2);
  });

  it("aceita quantidade fracionável", () => {
    expect(parseQuantityInput("20,250")).toBe(20.25);
    expect(parseQuantityInput("0")).toBeNull();
  });

  it("track_stock false não entra em alerta de baixo/zerado", () => {
    expect(
      getStockStatus({
        currentStock: 0,
        minimumStock: 5,
        archivedAt: null,
        trackStock: false,
      }),
    ).toBe("normal");
  });
});
