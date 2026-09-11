import {
  computeAvailableStock,
  getSellableStockAvailability,
  toQuantity,
  type SellableStockReason,
  type StockStatus,
} from "@/features/inventory/stock-engine";
import type { PosProductItem } from "@/features/pos/types";
import type { ProductUnit } from "@/types/database.types";

export type PosCatalogProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: ProductUnit;
  sale_price_cents: number | null;
  cost_price_cents: number;
  current_stock: number | string;
  minimum_stock?: number | string;
  track_stock: boolean;
  stock_status?: StockStatus;
  product_categories: { name: string } | { name: string }[] | null;
  product_batches: { quantity_remaining: number | string; expiration_date: string | null }[];
};

function categoryName(value: PosCatalogProductRow["product_categories"]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name;
}

export function mapPosCatalogProduct(row: PosCatalogProductRow, today: string): PosProductItem {
  const batches = (row.product_batches ?? []).map((batch) => ({
    id: "",
    batchCode: null,
    quantityRemaining: toQuantity(batch.quantity_remaining),
    expirationDate: batch.expiration_date,
    unitCostCents: null,
  }));

  const currentStock = toQuantity(row.current_stock);
  const minimumStock = toQuantity(row.minimum_stock);
  const availableStock = row.track_stock
    ? computeAvailableStock(currentStock, batches, today)
    : currentStock;

  const availability = getSellableStockAvailability({
    trackStock: row.track_stock,
    currentStock,
    availableStock,
    minimumStock,
    archivedAt: null,
  });

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id,
    categoryName: categoryName(row.product_categories),
    unit: row.unit,
    salePriceCents: row.sale_price_cents,
    costPriceCents: row.cost_price_cents,
    currentStock,
    availableStock,
    minimumStock,
    trackStock: row.track_stock,
    stockStatus: availability.status,
    availabilityReason: availability.reason,
    canSell: availability.canSell,
  };
}

export function posStockHint(reason: SellableStockReason): string | null {
  if (reason === "untracked") {
    return null;
  }

  if (reason === "expired") {
    return "Estoque existente, porém vencido/indisponível";
  }

  if (reason === "out") {
    return "Sem estoque";
  }

  if (reason === "low") {
    return "Estoque disponível baixo";
  }

  return null;
}
