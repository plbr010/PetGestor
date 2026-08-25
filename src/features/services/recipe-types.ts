import type { ProductUnit } from "@/types/database.types";

export type ServiceRecipeItem = {
  id: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantity: number;
};

export type ServiceOrderConsumptionItem = {
  id: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantity: number;
  unitCostCentsSnapshot: number | null;
  source: "recipe" | "manual";
  consumedAt: string | null;
  stockMovementId: string | null;
};

export function computeConsumptionCostCents(item: {
  quantity: number;
  unitCostCentsSnapshot: number | null;
}): number | null {
  if (item.unitCostCentsSnapshot == null || item.unitCostCentsSnapshot < 0) {
    return null;
  }

  return Math.round(item.quantity * item.unitCostCentsSnapshot);
}

export function sumConsumptionCostCents(
  items: { quantity: number; unitCostCentsSnapshot: number | null }[],
): number | null {
  let total = 0;
  let hasCost = false;

  for (const item of items) {
    const cost = computeConsumptionCostCents(item);
    if (cost == null) {
      continue;
    }
    hasCost = true;
    total += cost;
  }

  return hasCost ? total : null;
}
