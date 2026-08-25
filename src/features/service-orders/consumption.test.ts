import { describe, expect, it } from "vitest";

import {
  computeConsumptionCostCents,
  sumConsumptionCostCents,
} from "@/features/services/recipe-types";
import { mapServiceOrderError } from "@/features/service-orders/utils";
import { formatMovementType } from "@/features/inventory/utils";
import {
  applyStockMovement,
  type StockProductState,
} from "@/features/inventory/stock-engine";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function product(overrides: Partial<StockProductState> = {}): StockProductState {
  return {
    id: "product-1",
    companyId: COMPANY,
    currentStock: 100,
    costPriceCents: 50,
    archivedAt: null,
    trackStock: true,
    batches: [],
    appliedKeys: [],
    ...overrides,
  };
}

describe("consumo de insumos em atendimento", () => {
  it("A) serviço sem insumo — custo nulo", () => {
    expect(sumConsumptionCostCents([])).toBeNull();
  });

  it("B/C) custo de um ou vários insumos", () => {
    expect(
      computeConsumptionCostCents({ quantity: 20, unitCostCentsSnapshot: 6 }),
    ).toBe(120);
    expect(
      sumConsumptionCostCents([
        { quantity: 20, unitCostCentsSnapshot: 6 },
        { quantity: 10, unitCostCentsSnapshot: 8 },
        { quantity: 2, unitCostCentsSnapshot: 15 },
      ]),
    ).toBe(230);
  });

  it("U) não inventa custo sem snapshot", () => {
    expect(
      computeConsumptionCostCents({ quantity: 20, unitCostCentsSnapshot: null }),
    ).toBeNull();
    expect(
      sumConsumptionCostCents([{ quantity: 20, unitCostCentsSnapshot: null }]),
    ).toBeNull();
  });

  it("Q) quantidade fracionada em ml", () => {
    expect(
      computeConsumptionCostCents({ quantity: 0.02, unitCostCentsSnapshot: 5000 }),
    ).toBe(100);
  });

  it("K) estoque insuficiente bloqueia saída", () => {
    const applied = applyStockMovement(product({ currentStock: 15 }), {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 30,
      unitCostCents: 50,
      reason: "service_consumption",
      notes: "Thor — Banho",
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      today: "2026-08-25",
    });
    expect(applied.result.ok).toBe(false);
    if (!applied.result.ok) {
      expect(applied.result.error).toBe("insufficient_stock");
    }
  });

  it("I/J) baixa internal_use com motivo service_consumption", () => {
    const applied = applyStockMovement(product({ currentStock: 100 }), {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 30,
      unitCostCents: 50,
      reason: "service_consumption",
      notes: "Thor — Banho",
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      today: "2026-08-25",
    });
    expect(applied.result.ok).toBe(true);
    if (applied.result.ok) {
      expect(applied.result.newStock).toBe(70);
    }
  });

  it("M) idempotência — mesma chave não baixa duas vezes", () => {
    const key = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const first = applyStockMovement(product({ currentStock: 50 }), {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 20,
      unitCostCents: 50,
      reason: "service_consumption",
      notes: null,
      idempotencyKey: key,
      today: "2026-08-25",
    });
    const second = applyStockMovement(first.product, {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 20,
      unitCostCents: 50,
      reason: "service_consumption",
      notes: null,
      idempotencyKey: key,
      today: "2026-08-25",
    });
    expect(first.result.ok).toBe(true);
    expect(second.result.ok).toBe(true);
    if (first.result.ok && second.result.ok) {
      expect(second.result.duplicated).toBe(true);
      expect(second.result.newStock).toBe(first.result.newStock);
    }
  });

  it("N) concorrência — segunda baixa falha com estoque 1", () => {
    const base = product({ currentStock: 1 });
    const first = applyStockMovement(base, {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 1,
      unitCostCents: null,
      reason: "service_consumption",
      notes: null,
      idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      today: "2026-08-25",
    });
    const second = applyStockMovement(first.product, {
      companyId: COMPANY,
      type: "internal_use",
      quantity: 1,
      unitCostCents: null,
      reason: "service_consumption",
      notes: null,
      idempotencyKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      today: "2026-08-25",
    });
    expect(first.result.ok).toBe(true);
    expect(second.result.ok).toBe(false);
  });

  it("T) lote vencido não entra no disponível", () => {
    const applied = applyStockMovement(
      product({
        currentStock: 30,
        batches: [
          {
            id: "b1",
            batchCode: "L1",
            quantityRemaining: 20,
            expirationDate: "2026-08-01",
            unitCostCents: 50,
          },
          {
            id: "b2",
            batchCode: "L2",
            quantityRemaining: 10,
            expirationDate: "2026-09-01",
            unitCostCents: 50,
          },
        ],
      }),
      {
        companyId: COMPANY,
        type: "internal_use",
        quantity: 15,
        unitCostCents: 50,
        reason: "service_consumption",
        notes: null,
        idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        today: "2026-08-25",
      },
    );
    expect(applied.result.ok).toBe(false);
  });

  it("K) mensagem de estoque insuficiente detalhada", () => {
    expect(mapServiceOrderError("insufficient_stock|Shampoo Premium|30|15")).toBe(
      "Estoque insuficiente de Shampoo Premium. Necessário: 30. Disponível: 15.",
    );
  });

  it("histórico — label de consumo em atendimento", () => {
    expect(formatMovementType("internal_use", "service_consumption")).toBe(
      "Consumo em atendimento",
    );
  });

  it("R) sem conversão ml/litro — quantidade na unidade do produto", () => {
    // 20 ml no produto unit=ml; se produto for litro, usuário informa 0,020
    expect(
      computeConsumptionCostCents({ quantity: 20, unitCostCentsSnapshot: 5 }),
    ).toBe(100);
    expect(
      computeConsumptionCostCents({ quantity: 0.02, unitCostCentsSnapshot: 5000 }),
    ).toBe(100);
  });
});
