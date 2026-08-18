import type { ProductArchiveFilter, ProductStockFilter } from "@/features/inventory/types";
import type { StockStatus } from "@/features/inventory/stock-engine";
import { getStockStatus } from "@/features/inventory/stock-engine";

export type ProductFilterInput = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  categoryId: string | null;
  currentStock: number;
  minimumStock: number;
  trackStock: boolean;
  archivedAt: string | null;
};

export function parseArchiveFilter(value: string | undefined | null): ProductArchiveFilter {
  if (value === "archived" || value === "all") {
    return value;
  }

  return "active";
}

export function parseStockFilter(value: string | undefined | null): ProductStockFilter {
  if (value === "low" || value === "out") {
    return value;
  }

  return "all";
}

export function matchesProductFilters(
  product: ProductFilterInput,
  filters: {
    query?: string;
    categoryId?: string | null;
    archive?: ProductArchiveFilter;
    stock?: ProductStockFilter;
  },
): boolean {
  const archive = filters.archive ?? "active";
  const stock = filters.stock ?? "all";
  const query = filters.query?.trim().toLowerCase() ?? "";

  if (archive === "active" && product.archivedAt) {
    return false;
  }

  if (archive === "archived" && !product.archivedAt) {
    return false;
  }

  if (filters.categoryId && product.categoryId !== filters.categoryId) {
    return false;
  }

  if (query) {
    const haystack = [product.name, product.sku ?? "", product.barcode ?? ""]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(query)) {
      return false;
    }
  }

  const status: StockStatus = getStockStatus({
    currentStock: product.currentStock,
    minimumStock: product.minimumStock,
    archivedAt: product.archivedAt,
    trackStock: product.trackStock,
  });

  if (stock === "low" && status !== "low") {
    return false;
  }

  if (stock === "out" && status !== "out") {
    return false;
  }

  return true;
}

export function sortMovementsByRecent<T extends { createdAt: string }>(movements: T[]): T[] {
  return [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
