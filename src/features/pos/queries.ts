import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import {
  computeAvailableStock,
  getStockStatus,
  toQuantity,
} from "@/features/inventory/stock-engine";
import {
  parseSalePaymentMethodFilter,
  parseSalePeriodFilter,
  parseSaleStatusFilter,
} from "@/features/pos/status";
import type {
  PosDashboardMetrics,
  PosProductItem,
  PosSalesReport,
  SaleDetail,
  SaleListItem,
} from "@/features/pos/types";
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
import {
  addDaysToDateString,
  getTodayInTimezone,
  getWeekDates,
  localDateTimeToUtcIso,
} from "@/lib/timezone";
import type { PaymentMethod, ProductUnit, SaleStatus } from "@/types/database.types";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: ProductUnit;
  sale_price_cents: number | null;
  cost_price_cents: number;
  current_stock: number | string;
  track_stock: boolean;
  stock_status: "normal" | "low" | "out" | "archived";
  product_categories: { name: string } | { name: string }[] | null;
  product_batches: { quantity_remaining: number | string; expiration_date: string | null }[];
};

function categoryName(value: ProductRow["product_categories"]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name;
}

function mapPosProduct(row: ProductRow, today: string): PosProductItem {
  const batches = (row.product_batches ?? []).map((batch) => ({
    id: "",
    batchCode: null,
    quantityRemaining: toQuantity(batch.quantity_remaining),
    expirationDate: batch.expiration_date,
    unitCostCents: null,
  }));

  const currentStock = toQuantity(row.current_stock);
  const availableStock = row.track_stock
    ? computeAvailableStock(currentStock, batches, today)
    : currentStock;

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
    trackStock: row.track_stock,
    stockStatus: getStockStatus({
      currentStock,
      minimumStock: 0,
      archivedAt: null,
      trackStock: row.track_stock,
    }),
  };
}

export async function getPosCatalog(
  companyId: string,
  today: string,
  categoryId?: string,
): Promise<PosProductItem[]> {
  noStore();

  const supabase = await createSupabaseServerClient();
  let builder = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, category_id, unit, sale_price_cents, cost_price_cents, current_stock, track_stock, stock_status, product_categories(name), product_batches(quantity_remaining, expiration_date)",
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(500);

  if (categoryId && isValidUuid(categoryId)) {
    builder = builder.eq("category_id", categoryId);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error("Não foi possível carregar os produtos.");
  }

  return (data as ProductRow[]).map((row) => mapPosProduct(row, today));
}

type GetSalesParams = {
  companyId: string;
  timeZone: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: string;
  period?: string;
  from?: string;
  to?: string;
  customerId?: string;
  paymentMethod?: string;
};

type SaleRow = {
  id: string;
  sale_number: number;
  sold_at: string;
  total_cents: number;
  paid_cents: number;
  change_cents: number;
  status: SaleStatus;
  created_by_name: string;
  customer_id: string | null;
};

async function loadCustomerNames(
  companyId: string,
  customerIds: string[],
): Promise<Map<string, string>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name")
    .eq("company_id", companyId)
    .in("id", customerIds);

  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

function periodBounds(
  period: string,
  timeZone: string,
  from?: string,
  to?: string,
): { start?: string; end?: string } {
  const today = getTodayInTimezone(timeZone);

  if (period === "today") {
    return {
      start: localDateTimeToUtcIso(`${today}T00:00:00`, timeZone),
      end: localDateTimeToUtcIso(`${today}T23:59:59`, timeZone),
    };
  }

  if (period === "week") {
    const week = getWeekDates(today);
    return {
      start: localDateTimeToUtcIso(`${week[0]}T00:00:00`, timeZone),
      end: localDateTimeToUtcIso(`${week[6]}T23:59:59`, timeZone),
    };
  }

  if (period === "month") {
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = addDaysToDateString(
      addDaysToDateString(`${today.slice(0, 7)}-01`, 32).slice(0, 7) + "-01",
      -1,
    );
    return {
      start: localDateTimeToUtcIso(`${monthStart}T00:00:00`, timeZone),
      end: localDateTimeToUtcIso(`${monthEnd}T23:59:59`, timeZone),
    };
  }

  if (period === "custom" && from && to) {
    return {
      start: localDateTimeToUtcIso(`${from}T00:00:00`, timeZone),
      end: localDateTimeToUtcIso(`${to}T23:59:59`, timeZone),
    };
  }

  return {};
}

export async function getSales({
  companyId,
  timeZone,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  status,
  period,
  from,
  to,
  customerId,
  paymentMethod,
}: GetSalesParams): Promise<PaginatedResult<SaleListItem>> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from: rangeFrom, to: rangeTo } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);
  const statusFilter = parseSaleStatusFilter(status);
  const periodFilter = parseSalePeriodFilter(period);
  const paymentFilter = parseSalePaymentMethodFilter(paymentMethod);
  const bounds = periodBounds(periodFilter, timeZone, from, to);

  let builder = supabase
    .from("sales")
    .select(
      "id, sale_number, sold_at, total_cents, paid_cents, change_cents, status, created_by_name, customer_id",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("sold_at", { ascending: false });

  if (statusFilter !== "all") {
    builder = builder.eq("status", statusFilter);
  }

  if (customerId && isValidUuid(customerId)) {
    builder = builder.eq("customer_id", customerId);
  }

  if (bounds.start) {
    builder = builder.gte("sold_at", bounds.start);
  }

  if (bounds.end) {
    builder = builder.lte("sold_at", bounds.end);
  }

  if (search) {
    builder = builder.or(
      [`sale_number.eq.${Number.parseInt(search, 10) || -1}`, `created_by_name.ilike.%${search}%`].join(
        ",",
      ),
    );
  }

  if (paymentFilter !== "all") {
    const { data: paymentRows } = await supabase
      .from("financial_payments")
      .select("financial_entry_id")
      .eq("company_id", companyId)
      .eq("payment_method", paymentFilter)
      .is("cancelled_at", null);

    const entryIds = [...new Set((paymentRows ?? []).map((row) => row.financial_entry_id))];

    if (entryIds.length === 0) {
      return buildPaginatedResult([], 0, safePage, pageSize);
    }

    builder = builder.in("financial_entry_id", entryIds);
  }

  const { data, error, count } = await builder.range(rangeFrom, rangeTo);

  if (error) {
    throw new Error("Não foi possível carregar as vendas.");
  }

  const rows = data as SaleRow[];
  const customerMap = await loadCustomerNames(
    companyId,
    [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))],
  );

  const items = rows.map((row) => ({
    id: row.id,
    saleNumber: row.sale_number,
    soldAt: row.sold_at,
    customerName: row.customer_id ? (customerMap.get(row.customer_id) ?? null) : null,
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
    status: row.status,
    createdByName: row.created_by_name,
    changeCents: row.change_cents,
  }));

  return buildPaginatedResult(items, count ?? 0, safePage, pageSize);
}

export async function requireSaleById(companyId: string, saleId: string): Promise<SaleDetail> {
  noStore();

  if (!isValidUuid(saleId)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      "id, sale_number, status, sold_at, customer_id, subtotal_cents, discount_cents, discount_type, discount_percent, total_cents, paid_cents, change_cents, created_by_name, discount_applied_by, cancelled_at, cancel_reason, financial_entry_id",
    )
    .eq("company_id", companyId)
    .eq("id", saleId)
    .maybeSingle();

  if (error || !sale) {
    notFound();
  }

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase
      .from("sale_items")
      .select(
        "id, product_name_snapshot, quantity, unit_price_cents, cost_price_cents_snapshot, subtotal_cents, total_cents",
      )
      .eq("company_id", companyId)
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true }),
    sale.financial_entry_id
      ? supabase
          .from("financial_payments")
          .select("id, amount_cents, payment_method, paid_at, cancelled_at")
          .eq("company_id", companyId)
          .eq("financial_entry_id", sale.financial_entry_id)
          .order("paid_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const customerMap = await loadCustomerNames(
    companyId,
    sale.customer_id ? [sale.customer_id] : [],
  );

  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    status: sale.status,
    soldAt: sale.sold_at,
    customerId: sale.customer_id,
    customerName: sale.customer_id ? (customerMap.get(sale.customer_id) ?? null) : null,
    subtotalCents: sale.subtotal_cents,
    discountCents: sale.discount_cents,
    discountType: sale.discount_type,
    discountPercent: sale.discount_percent != null ? Number(sale.discount_percent) : null,
    totalCents: sale.total_cents,
    paidCents: sale.paid_cents,
    changeCents: sale.change_cents,
    createdByName: sale.created_by_name,
    discountAppliedBy: sale.discount_applied_by,
    cancelledAt: sale.cancelled_at,
    cancelReason: sale.cancel_reason,
    financialEntryId: sale.financial_entry_id,
    items: (items ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name_snapshot,
      quantity: toQuantity(item.quantity),
      unitPriceCents: item.unit_price_cents,
      costPriceCentsSnapshot: item.cost_price_cents_snapshot,
      subtotalCents: item.subtotal_cents,
      totalCents: item.total_cents,
    })),
    payments: (payments ?? []).map((payment) => ({
      id: payment.id,
      amountCents: payment.amount_cents,
      paymentMethod: payment.payment_method as PaymentMethod,
      paidAt: payment.paid_at,
      cancelledAt: payment.cancelled_at,
    })),
  };
}

export async function getPosDashboardMetrics(
  companyId: string,
  timeZone: string,
): Promise<PosDashboardMetrics> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const today = getTodayInTimezone(timeZone);
  const start = localDateTimeToUtcIso(`${today}T00:00:00`, timeZone);
  const end = localDateTimeToUtcIso(`${today}T23:59:59`, timeZone);

  const [{ data: sales }, { data: itemRows }] = await Promise.all([
    supabase
      .from("sales")
      .select("total_cents")
      .eq("company_id", companyId)
      .neq("status", "cancelled")
      .gte("sold_at", start)
      .lte("sold_at", end),
    supabase
      .from("sale_items")
      .select("quantity, sales!inner(sold_at, status, company_id)")
      .eq("company_id", companyId)
      .gte("sales.sold_at", start)
      .lte("sales.sold_at", end)
      .neq("sales.status", "cancelled"),
  ]);

  const salesCountToday = sales?.length ?? 0;
  const totalSoldTodayCents = (sales ?? []).reduce((sum, row) => sum + row.total_cents, 0);
  const productsSoldToday = (itemRows ?? []).reduce(
    (sum, row) => sum + toQuantity(row.quantity),
    0,
  );

  return { salesCountToday, totalSoldTodayCents, productsSoldToday };
}

export async function getPosSalesReport(
  companyId: string,
  timeZone: string,
  period = "month",
): Promise<PosSalesReport> {
  noStore();

  const bounds = periodBounds(parseSalePeriodFilter(period), timeZone);
  const supabase = await createSupabaseServerClient();

  let salesQuery = supabase
    .from("sales")
    .select("id, total_cents")
    .eq("company_id", companyId)
    .neq("status", "cancelled");

  if (bounds.start) salesQuery = salesQuery.gte("sold_at", bounds.start);
  if (bounds.end) salesQuery = salesQuery.lte("sold_at", bounds.end);

  const { data: sales } = await salesQuery;
  const saleIds = (sales ?? []).map((row) => row.id);

  const totalSoldCents = (sales ?? []).reduce((sum, row) => sum + row.total_cents, 0);
  const salesCount = sales?.length ?? 0;
  const averageTicketCents = salesCount > 0 ? Math.round(totalSoldCents / salesCount) : 0;

  if (saleIds.length === 0) {
    return {
      totalSoldCents: 0,
      salesCount: 0,
      averageTicketCents: 0,
      grossMarginCents: 0,
      topProducts: [],
    };
  }

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_name_snapshot, quantity, unit_price_cents, cost_price_cents_snapshot")
    .eq("company_id", companyId)
    .in("sale_id", saleIds);

  const grossMarginCents = (items ?? []).reduce((sum, item) => {
    const qty = toQuantity(item.quantity);
    const revenue = Math.round(qty * item.unit_price_cents);
    const cost = Math.round(qty * item.cost_price_cents_snapshot);
    return sum + (revenue - cost);
  }, 0);

  const productMap = new Map<string, { quantity: number; revenueCents: number }>();

  for (const item of items ?? []) {
    const qty = toQuantity(item.quantity);
    const current = productMap.get(item.product_name_snapshot) ?? { quantity: 0, revenueCents: 0 };
    productMap.set(item.product_name_snapshot, {
      quantity: current.quantity + qty,
      revenueCents: current.revenueCents + Math.round(qty * item.unit_price_cents),
    });
  }

  const topProducts = [...productMap.entries()]
    .map(([productName, stats]) => ({ productName, ...stats }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  return {
    totalSoldCents,
    salesCount,
    averageTicketCents,
    grossMarginCents,
    topProducts,
  };
}
