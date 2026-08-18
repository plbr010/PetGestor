import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import {
  computeAvailableStock,
  getStockStatus,
  isExpiredDate,
  isExpiringSoon,
  toQuantity,
  type StockStatus,
} from "@/features/inventory/stock-engine";
import { DEFAULT_PRODUCT_CATEGORY_NAMES } from "@/features/inventory/units";
import { parseArchiveFilter, parseStockFilter } from "@/features/inventory/filters";
import { getSignedMovementQuantity } from "@/features/inventory/utils";
import type {
  InventoryDashboardAlert,
  InventorySupplierItem,
  ProductBatchView,
  ProductCategoryItem,
  ProductDetail,
  ProductListItem,
  StockMovementView,
} from "@/features/inventory/types";
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductUnit, StockMovementType } from "@/types/database.types";

type GetProductsParams = {
  companyId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  categoryId?: string;
  archive?: string;
  stock?: string;
  today: string;
};

type ProductQueryRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: ProductUnit;
  cost_price_cents: number;
  sale_price_cents: number | null;
  current_stock: number | string;
  minimum_stock: number | string;
  active: boolean;
  track_stock: boolean;
  archived_at: string | null;
  stock_status: StockStatus;
  product_categories: { name: string } | { name: string }[] | null;
};

function categoryNameFromJoin(
  value: ProductQueryRow["product_categories"],
): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value.name;
}

function mapProductListItem(
  row: ProductQueryRow,
  today: string,
  availableStock: number,
  expirationAlert: ProductListItem["expirationAlert"],
): ProductListItem {
  const currentStock = toQuantity(row.current_stock);
  const minimumStock = toQuantity(row.minimum_stock);

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id,
    categoryName: categoryNameFromJoin(row.product_categories),
    unit: row.unit,
    costPriceCents: row.cost_price_cents,
    salePriceCents: row.sale_price_cents,
    currentStock,
    minimumStock,
    availableStock,
    active: row.active,
    trackStock: row.track_stock,
    archivedAt: row.archived_at,
    stockStatus: getStockStatus({
      currentStock,
      minimumStock,
      archivedAt: row.archived_at,
      trackStock: row.track_stock,
    }),
    expirationAlert,
  };
}

async function loadBatchAlerts(
  companyId: string,
  productIds: string[],
  today: string,
): Promise<{
  alertByProduct: Map<string, ProductListItem["expirationAlert"]>;
  batchesByProduct: Map<string, ProductBatchView[]>;
}> {
  const alertByProduct = new Map<string, ProductListItem["expirationAlert"]>();
  const batchesByProduct = new Map<string, ProductBatchView[]>();

  if (productIds.length === 0) {
    return { alertByProduct, batchesByProduct };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_batches")
    .select("id, product_id, batch_code, quantity_remaining, expiration_date, unit_cost_cents")
    .eq("company_id", companyId)
    .in("product_id", productIds)
    .gt("quantity_remaining", 0)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar os lotes.");
  }

  for (const row of data ?? []) {
    const quantityRemaining = toQuantity(row.quantity_remaining);
    const expired = isExpiredDate(row.expiration_date, today);
    const expiringSoon = isExpiringSoon(row.expiration_date, today);
    const batch: ProductBatchView = {
      id: row.id,
      batchCode: row.batch_code,
      quantityRemaining,
      expirationDate: row.expiration_date,
      unitCostCents: row.unit_cost_cents,
      expired,
      expiringSoon,
    };
    const current = batchesByProduct.get(row.product_id) ?? [];
    current.push(batch);
    batchesByProduct.set(row.product_id, current);

    if (expired) {
      alertByProduct.set(row.product_id, "expired");
    } else if (expiringSoon && alertByProduct.get(row.product_id) !== "expired") {
      alertByProduct.set(row.product_id, "expiring");
    }
  }

  return { alertByProduct, batchesByProduct };
}

export async function ensureDefaultProductCategories(
  companyId: string,
  userId: string,
): Promise<void> {
  if (!isValidUuid(companyId) || !isValidUuid(userId)) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("product_categories")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error || (count ?? 0) > 0) {
    return;
  }

  await supabase.from("product_categories").insert(
    DEFAULT_PRODUCT_CATEGORY_NAMES.map((name) => ({
      company_id: companyId,
      name,
      created_by: userId,
    })),
  );
}

export async function getProductCategories(
  companyId: string,
  options?: { includeArchived?: boolean },
): Promise<ProductCategoryItem[]> {
  noStore();

  if (!isValidUuid(companyId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  let builder = supabase
    .from("product_categories")
    .select("id, name, archived_at, created_at, updated_at")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (!options?.includeArchived) {
    builder = builder.is("archived_at", null);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error("Não foi possível carregar as categorias.");
  }

  return data ?? [];
}

export async function getProducts({
  companyId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  categoryId,
  archive,
  stock,
  today,
}: GetProductsParams): Promise<PaginatedResult<ProductListItem>> {
  noStore();

  if (!isValidUuid(companyId)) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);
  const archiveFilter = parseArchiveFilter(archive);
  const stockFilter = parseStockFilter(stock);

  let builder = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, category_id, unit, cost_price_cents, sale_price_cents, current_stock, minimum_stock, active, track_stock, archived_at, stock_status, product_categories(name)",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (archiveFilter === "active") {
    builder = builder.is("archived_at", null);
  } else if (archiveFilter === "archived") {
    builder = builder.not("archived_at", "is", null);
  }

  if (stockFilter === "low" || stockFilter === "out") {
    builder = builder.eq("stock_status", stockFilter).eq("track_stock", true);
  }

  if (categoryId && isValidUuid(categoryId)) {
    builder = builder.eq("category_id", categoryId);
  }

  if (search) {
    builder = builder.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  }

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    throw new Error("Não foi possível carregar os produtos.");
  }

  const rows = (data ?? []) as ProductQueryRow[];
  const productIds = rows.map((row) => row.id);
  const { alertByProduct, batchesByProduct } = await loadBatchAlerts(
    companyId,
    productIds,
    today,
  );

  const mapped = rows.map((row) => {
    const currentStock = toQuantity(row.current_stock);
    const batches = batchesByProduct.get(row.id) ?? [];
    const availableStock = computeAvailableStock(
      currentStock,
      batches.map((batch) => ({
        id: batch.id,
        batchCode: batch.batchCode,
        quantityRemaining: batch.quantityRemaining,
        expirationDate: batch.expirationDate,
        unitCostCents: batch.unitCostCents,
      })),
      today,
    );

    return mapProductListItem(
      row,
      today,
      availableStock,
      alertByProduct.get(row.id) ?? null,
    );
  });

  return buildPaginatedResult(mapped, count ?? 0, safePage, pageSize);
}

export async function getProductById(
  companyId: string,
  productId: string,
  today: string,
): Promise<ProductDetail | null> {
  noStore();

  if (!isValidUuid(companyId) || !isValidUuid(productId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, company_id, name, sku, barcode, category_id, description, unit, cost_price_cents, sale_price_cents, current_stock, minimum_stock, active, track_stock, archived_at, created_at, updated_at, stock_status, product_categories(name)",
    )
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const [{ alertByProduct, batchesByProduct }, movements, suppliers] = await Promise.all([
    loadBatchAlerts(companyId, [productId], today),
    getStockMovements({ companyId, productId, page: 1, pageSize: 50 }),
    getSuppliersLinkedToProduct(companyId, productId),
  ]);

  const row = data as ProductQueryRow & {
    company_id: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
  const currentStock = toQuantity(row.current_stock);
  const batches = batchesByProduct.get(productId) ?? [];
  const availableStock = computeAvailableStock(
    currentStock,
    batches.map((batch) => ({
      id: batch.id,
      batchCode: batch.batchCode,
      quantityRemaining: batch.quantityRemaining,
      expirationDate: batch.expirationDate,
      unitCostCents: batch.unitCostCents,
    })),
    today,
  );

  return {
    ...mapProductListItem(
      row,
      today,
      availableStock,
      alertByProduct.get(productId) ?? null,
    ),
    companyId: row.company_id,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    batches,
    movements: movements.data,
    suppliers,
  };
}

export async function requireProductById(
  companyId: string,
  productId: string,
  today: string,
): Promise<ProductDetail> {
  const product = await getProductById(companyId, productId, today);

  if (!product) {
    notFound();
  }

  return product;
}

export async function requireActiveProductById(
  companyId: string,
  productId: string,
  today: string,
): Promise<ProductDetail> {
  const product = await requireProductById(companyId, productId, today);

  if (product.archivedAt) {
    notFound();
  }

  return product;
}

export async function getStockMovements({
  companyId,
  productId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  companyId: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResult<StockMovementView>> {
  noStore();

  if (!isValidUuid(companyId) || (productId && !isValidUuid(productId))) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);

  let builder = supabase
    .from("stock_movements")
    .select(
      "id, product_id, type, quantity, previous_quantity, new_quantity, unit_cost_cents, reason, notes, supplier_id, created_by_name, created_at, products(name), inventory_suppliers(name)",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (productId) {
    builder = builder.eq("product_id", productId);
  }

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    throw new Error("Não foi possível carregar as movimentações.");
  }

  const rows = (data ?? []) as Array<{
    id: string;
    product_id: string;
    type: StockMovementType;
    quantity: number | string;
    previous_quantity: number | string;
    new_quantity: number | string;
    unit_cost_cents: number | null;
    reason: string | null;
    notes: string | null;
    supplier_id: string | null;
    created_by_name: string;
    created_at: string;
    products: { name: string } | { name: string }[] | null;
    inventory_suppliers: { name: string } | { name: string }[] | null;
  }>;

  const mapped: StockMovementView[] = rows.map((row) => {
    const quantity = toQuantity(row.quantity);
    const previousQuantity = toQuantity(row.previous_quantity);
    const newQuantity = toQuantity(row.new_quantity);
    const productName = Array.isArray(row.products)
      ? (row.products[0]?.name ?? "Produto")
      : (row.products?.name ?? "Produto");
    const supplierName = Array.isArray(row.inventory_suppliers)
      ? (row.inventory_suppliers[0]?.name ?? null)
      : (row.inventory_suppliers?.name ?? null);

    return {
      id: row.id,
      productId: row.product_id,
      productName,
      type: row.type,
      quantity,
      signedQuantity: getSignedMovementQuantity({
        type: row.type,
        quantity,
        previousQuantity,
        newQuantity,
      }),
      previousQuantity,
      newQuantity,
      unitCostCents: row.unit_cost_cents,
      reason: row.reason,
      notes: row.notes,
      supplierId: row.supplier_id,
      supplierName,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    };
  });

  return buildPaginatedResult(mapped, count ?? 0, safePage, pageSize);
}

async function getSuppliersLinkedToProduct(
  companyId: string,
  productId: string,
): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("supplier_id, inventory_suppliers(id, name)")
    .eq("company_id", companyId)
    .eq("product_id", productId)
    .not("supplier_id", "is", null);

  if (error) {
    return [];
  }

  const unique = new Map<string, string>();

  for (const row of data ?? []) {
    const supplier = Array.isArray(row.inventory_suppliers)
      ? row.inventory_suppliers[0]
      : row.inventory_suppliers;

    if (supplier?.id && supplier.name) {
      unique.set(supplier.id, supplier.name);
    }
  }

  return [...unique.entries()].map(([id, name]) => ({ id, name }));
}

export async function getInventorySuppliers(
  companyId: string,
  options?: { query?: string; includeArchived?: boolean; page?: number; pageSize?: number },
): Promise<PaginatedResult<InventorySupplierItem>> {
  noStore();

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  if (!isValidUuid(companyId)) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(options?.page ?? 1));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(options?.query);

  let builder = supabase
    .from("inventory_suppliers")
    .select(
      "id, name, contact_name, phone, email, document, notes, active, archived_at, created_at, updated_at",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (!options?.includeArchived) {
    builder = builder.is("archived_at", null);
  }

  if (search) {
    builder = builder.or(`name.ilike.%${search}%,contact_name.ilike.%${search}%`);
  }

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores.");
  }

  return buildPaginatedResult(data ?? [], count ?? 0, safePage, pageSize);
}

export async function getActiveInventorySuppliers(
  companyId: string,
): Promise<Array<{ id: string; name: string }>> {
  const result = await getInventorySuppliers(companyId, { pageSize: 200 });
  return result.data
    .filter((supplier) => supplier.active && !supplier.archived_at)
    .map((supplier) => ({ id: supplier.id, name: supplier.name }));
}

export async function getInventorySupplierById(
  companyId: string,
  supplierId: string,
): Promise<InventorySupplierItem | null> {
  noStore();

  if (!isValidUuid(companyId) || !isValidUuid(supplierId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .select(
      "id, name, contact_name, phone, email, document, notes, active, archived_at, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function requireInventorySupplierById(
  companyId: string,
  supplierId: string,
): Promise<InventorySupplierItem> {
  const supplier = await getInventorySupplierById(companyId, supplierId);

  if (!supplier) {
    notFound();
  }

  return supplier;
}

export async function getInventoryDashboardAlerts(
  companyId: string,
): Promise<InventoryDashboardAlert> {
  noStore();

  if (!isValidUuid(companyId)) {
    return { lowStockCount: 0, outOfStockCount: 0 };
  }

  const supabase = await createSupabaseServerClient();

  const [low, out] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("stock_status", "low")
      .eq("track_stock", true)
      .is("archived_at", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("stock_status", "out")
      .eq("track_stock", true)
      .is("archived_at", null),
  ]);

  return {
    lowStockCount: low.count ?? 0,
    outOfStockCount: out.count ?? 0,
  };
}
