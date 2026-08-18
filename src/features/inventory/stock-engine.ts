const QUANTITY_SCALE = 1000;
const MAX_QUANTITY = 999_999.999;

export function roundQuantity(value: number): number {
  return Math.round(value * QUANTITY_SCALE) / QUANTITY_SCALE;
}

export function parseNonNegativeQuantityInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");

  if (!normalized || !/^\d+(\.\d{1,3})?$/.test(normalized)) {
    return null;
  }

  const value = Number.parseFloat(normalized);

  if (!Number.isFinite(value) || value < 0 || value > MAX_QUANTITY) {
    return null;
  }

  return roundQuantity(value);
}

export function parseQuantityInput(raw: string): number | null {
  const value = parseNonNegativeQuantityInput(raw);

  if (value == null || value <= 0) {
    return null;
  }

  return value;
}

export function toQuantity(value: string | number | null | undefined): number {
  if (value == null || value === "") {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? roundQuantity(parsed) : 0;
}

export function formatQuantity(value: number, shortUnit?: string): string {
  const rounded = roundQuantity(value);
  const [intPart, fracPart] = rounded.toFixed(3).split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");
  const formatted = trimmedFrac.length > 0 ? `${intPart},${trimmedFrac}` : intPart;
  return shortUnit ? `${formatted} ${shortUnit}` : formatted;
}

export function computeWeightedAverageCostCents(
  currentStock: number,
  currentCostCents: number,
  incomingQty: number,
  incomingCostCents: number,
): number {
  const nextStock = roundQuantity(currentStock + incomingQty);

  if (nextStock <= 0 || currentStock <= 0) {
    return incomingCostCents;
  }

  return Math.round(
    (currentStock * currentCostCents + incomingQty * incomingCostCents) / nextStock,
  );
}

export type StockStatus = "normal" | "low" | "out" | "archived";

export function getStockStatus(input: {
  currentStock: number;
  minimumStock: number;
  archivedAt: string | null;
  trackStock: boolean;
}): StockStatus {
  if (input.archivedAt) {
    return "archived";
  }

  if (!input.trackStock) {
    return "normal";
  }

  if (input.currentStock <= 0) {
    return "out";
  }

  if (input.currentStock <= input.minimumStock) {
    return "low";
  }

  return "normal";
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  normal: "Normal",
  low: "Estoque baixo",
  out: "Sem estoque",
  archived: "Arquivado",
};

export type StockBatchState = {
  id: string;
  batchCode: string | null;
  quantityRemaining: number;
  expirationDate: string | null;
  unitCostCents: number | null;
};

export type StockProductState = {
  id: string;
  companyId: string;
  currentStock: number;
  costPriceCents: number;
  archivedAt: string | null;
  trackStock: boolean;
  batches: StockBatchState[];
  appliedKeys: string[];
};

export type StockMovementDraft = {
  companyId: string;
  type: "entry" | "exit" | "adjustment" | "loss" | "internal_use" | "return";
  quantity: number;
  unitCostCents: number | null;
  reason: string | null;
  notes: string | null;
  idempotencyKey: string;
  countedStock?: number;
  batchCode?: string | null;
  expirationDate?: string | null;
  today?: string;
};

export type StockEngineResult =
  | {
      ok: true;
      duplicated: boolean;
      previousStock: number;
      newStock: number;
      costPriceCents: number;
      availableStock: number;
    }
  | { ok: false; error: string };

export function isExpiredDate(expirationDate: string | null, today: string): boolean {
  return Boolean(expirationDate && expirationDate < today);
}

export function isExpiringSoon(expirationDate: string | null, today: string, days = 30): boolean {
  if (!expirationDate || isExpiredDate(expirationDate, today)) {
    return false;
  }

  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const expMs = Date.parse(`${expirationDate}T00:00:00.000Z`);
  return expMs - todayMs <= days * 24 * 60 * 60 * 1000;
}

export function computeExpiredQuantity(batches: StockBatchState[], today: string): number {
  return roundQuantity(
    batches.reduce((sum, batch) => {
      return isExpiredDate(batch.expirationDate, today) ? sum + batch.quantityRemaining : sum;
    }, 0),
  );
}

export function computeAvailableStock(
  currentStock: number,
  batches: StockBatchState[],
  today: string,
): number {
  const expired = computeExpiredQuantity(batches, today);
  return roundQuantity(Math.max(0, currentStock - expired));
}

function deductFromBatches(
  batches: StockBatchState[],
  quantity: number,
  today: string,
  includeExpired: boolean,
): StockBatchState[] {
  let remaining = quantity;
  const next = batches.map((batch) => ({ ...batch }));
  const ordered = [...next].sort((a, b) => {
    if (!a.expirationDate) {
      return 1;
    }
    if (!b.expirationDate) {
      return -1;
    }
    return a.expirationDate.localeCompare(b.expirationDate);
  });

  for (const batch of ordered) {
    if (remaining <= 0) {
      break;
    }

    if (!includeExpired && isExpiredDate(batch.expirationDate, today)) {
      continue;
    }

    const take = Math.min(batch.quantityRemaining, remaining);
    batch.quantityRemaining = roundQuantity(batch.quantityRemaining - take);
    remaining = roundQuantity(remaining - take);
  }

  return next;
}

export function applyStockMovement(
  product: StockProductState,
  input: StockMovementDraft,
): { product: StockProductState; result: StockEngineResult } {
  if (product.appliedKeys.includes(input.idempotencyKey)) {
    return {
      product,
      result: {
        ok: true,
        duplicated: true,
        previousStock: product.currentStock,
        newStock: product.currentStock,
        costPriceCents: product.costPriceCents,
        availableStock: computeAvailableStock(
          product.currentStock,
          product.batches,
          input.today ?? "9999-12-31",
        ),
      },
    };
  }

  if (input.companyId !== product.companyId) {
    return { product, result: { ok: false, error: "tenant_mismatch" } };
  }

  if (product.archivedAt) {
    return { product, result: { ok: false, error: "archived_product" } };
  }

  const today = input.today ?? "9999-12-31";
  const previousStock = product.currentStock;
  let quantityDelta = 0;
  let nextCost = product.costPriceCents;
  let nextBatches = product.batches.map((batch) => ({ ...batch }));

  if (input.type === "entry" || input.type === "return") {
    quantityDelta = input.quantity;
    if (input.unitCostCents != null) {
      nextCost = computeWeightedAverageCostCents(
        previousStock,
        product.costPriceCents,
        input.quantity,
        input.unitCostCents,
      );
    }

    if (input.batchCode || input.expirationDate) {
      const existing = nextBatches.find(
        (batch) =>
          batch.batchCode === (input.batchCode ?? null) &&
          batch.expirationDate === (input.expirationDate ?? null),
      );

      if (existing) {
        existing.quantityRemaining = roundQuantity(existing.quantityRemaining + input.quantity);
      } else {
        nextBatches.push({
          id: `batch-${nextBatches.length + 1}`,
          batchCode: input.batchCode ?? null,
          quantityRemaining: input.quantity,
          expirationDate: input.expirationDate ?? null,
          unitCostCents: input.unitCostCents,
        });
      }
    }
  } else if (input.type === "adjustment") {
    if (input.countedStock == null || input.countedStock < 0) {
      return { product, result: { ok: false, error: "invalid_counted_stock" } };
    }

    quantityDelta = roundQuantity(input.countedStock - previousStock);

    if (quantityDelta < 0) {
      nextBatches = deductFromBatches(nextBatches, -quantityDelta, today, true);
    }
  } else {
    const includeExpired = input.reason === "expired" || input.type === "loss";
    const available = includeExpired
      ? previousStock
      : computeAvailableStock(previousStock, nextBatches, today);

    if (input.quantity > available) {
      return { product, result: { ok: false, error: "insufficient_stock" } };
    }

    quantityDelta = -input.quantity;
    nextBatches = deductFromBatches(nextBatches, input.quantity, today, includeExpired);
  }

  const newStock = roundQuantity(previousStock + quantityDelta);

  if (newStock < 0) {
    return { product, result: { ok: false, error: "negative_stock" } };
  }

  const nextProduct: StockProductState = {
    ...product,
    currentStock: newStock,
    costPriceCents: nextCost,
    batches: nextBatches,
    appliedKeys: [...product.appliedKeys, input.idempotencyKey],
  };

  return {
    product: nextProduct,
    result: {
      ok: true,
      duplicated: false,
      previousStock,
      newStock,
      costPriceCents: nextCost,
      availableStock: computeAvailableStock(newStock, nextBatches, today),
    },
  };
}

export function applyConcurrentMovements(
  product: StockProductState,
  movements: StockMovementDraft[],
): StockProductState {
  let current = product;

  for (const movement of movements) {
    const applied = applyStockMovement(current, movement);
    if (applied.result.ok) {
      current = applied.product;
    }
  }

  return current;
}
