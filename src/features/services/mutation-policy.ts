import type { PetSize, ServicePricingMode } from "@/types/database.types";

export type ServiceRecipeInput = {
  productId: string;
  quantity: number;
};

export type ServiceSizePriceInput = {
  size: PetSize;
  priceCents: number;
  durationMinutes: number;
};

export type ServiceMutationPayload = {
  name: string;
  description: string | null;
  pricingMode: ServicePricingMode;
  priceCents: number | null;
  durationMinutes: number;
  active: boolean;
  sizePrices: ServiceSizePriceInput[] | null;
  recipes: ServiceRecipeInput[];
};

const MAX_RECIPE_QUANTITY = 999999.999;

export function roundRecipeQuantity(quantity: number): number {
  return Math.round(quantity * 1000) / 1000;
}

export function normalizeServiceRecipes(
  recipes: ServiceRecipeInput[],
): ServiceRecipeInput[] {
  return [...recipes]
    .map((item) => ({
      productId: item.productId,
      quantity: roundRecipeQuantity(item.quantity),
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function normalizeServiceSizePrices(
  sizePrices: ServiceSizePriceInput[] | null,
): ServiceSizePriceInput[] {
  if (!sizePrices) {
    return [];
  }

  return [...sizePrices].sort((a, b) => a.size.localeCompare(b.size));
}

/**
 * Fingerprint canônico: ordem da ficha/portes não muda o hash.
 * Sem segredo. Espelha private.service_mutation_fingerprint.
 */
export function serviceMutationFingerprint(payload: ServiceMutationPayload): string {
  const canonical = {
    name: payload.name.trim(),
    description: payload.description?.trim() ? payload.description.trim() : null,
    pricing_mode: payload.pricingMode,
    price_cents: payload.priceCents,
    duration_minutes: payload.durationMinutes,
    active: payload.active,
    size_prices: normalizeServiceSizePrices(payload.sizePrices).map((row) => ({
      size: row.size,
      price_cents: row.priceCents,
      duration_minutes: row.durationMinutes,
    })),
    items: normalizeServiceRecipes(payload.recipes).map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  };

  return JSON.stringify(canonical);
}

export function recipesToRpcPayload(
  recipes: ServiceRecipeInput[],
): { product_id: string; quantity: number }[] {
  return recipes.map((item) => ({
    product_id: item.productId,
    quantity: roundRecipeQuantity(item.quantity),
  }));
}

export function assertValidRecipeItems(
  recipes: ServiceRecipeInput[],
): { ok: true } | { ok: false; error: "invalid_recipe_quantity" | "duplicate_recipe_product" } {
  const seen = new Set<string>();

  for (const item of recipes) {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_RECIPE_QUANTITY
    ) {
      return { ok: false, error: "invalid_recipe_quantity" };
    }

    if (seen.has(item.productId)) {
      return { ok: false, error: "duplicate_recipe_product" };
    }
    seen.add(item.productId);
  }

  return { ok: true };
}
