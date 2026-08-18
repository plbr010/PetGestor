import { unstable_noStore as noStore } from "next/cache";

import { buildFinancialAnalytics } from "@/features/finance/analytics/engine";
import { resolveFinanceAnalyticsPeriod } from "@/features/finance/analytics/period";
import type {
  AnalyticsEntryRow,
  AnalyticsPaymentRow,
  AnalyticsSaleItemRow,
  FinanceAnalytics,
  FinanceAnalyticsPreset,
} from "@/features/finance/analytics/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";
import { addDaysToDateString, localDateTimeToUtcIso } from "@/lib/timezone";
import type { FinancialSourceType } from "@/types/database.types";

const ANALYTICS_ENTRY_SELECT = `
  id, entry_type, status, source_type, amount_cents, category, description,
  created_at, paid_at, service_order_id, sale_id, customer_service_package_id,
  service_orders(
    appointments(service_name_snapshot)
  ),
  sales(sale_number),
  customer_service_packages(package_name_snapshot)
`;

type EntryQueryRow = {
  id: string;
  entry_type: "income" | "expense";
  status: string;
  source_type: FinancialSourceType;
  amount_cents: number;
  category: string | null;
  description: string;
  created_at: string;
  paid_at: string | null;
  service_order_id: string | null;
  sale_id: string | null;
  customer_service_package_id: string | null;
  service_orders:
    | { appointments: { service_name_snapshot: string } | { service_name_snapshot: string }[] | null }
    | { appointments: { service_name_snapshot: string } | { service_name_snapshot: string }[] | null }[]
    | null;
  sales: { sale_number: number } | { sale_number: number }[] | null;
  customer_service_packages:
    | { package_name_snapshot: string }
    | { package_name_snapshot: string }[]
    | null;
};

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function getPeriodBounds(from: string, to: string, timeZone: string) {
  const start = localDateTimeToUtcIso(from, "00:00", timeZone);
  const endIso = localDateTimeToUtcIso(addDaysToDateString(to, 1), "00:00", timeZone);
  return { start, endIso };
}

function mapEntryRow(row: EntryQueryRow): AnalyticsEntryRow {
  const serviceOrder = unwrapJoin(row.service_orders);
  const appointment = serviceOrder ? unwrapJoin(serviceOrder.appointments) : null;
  const sale = unwrapJoin(row.sales);
  const pkg = unwrapJoin(row.customer_service_packages);

  let detailLabel: string | null = null;
  if (appointment?.service_name_snapshot) {
    detailLabel = appointment.service_name_snapshot;
  } else if (pkg?.package_name_snapshot) {
    detailLabel = pkg.package_name_snapshot;
  } else if (sale?.sale_number != null) {
    detailLabel = `Venda #${sale.sale_number}`;
  }

  return {
    id: row.id,
    entryType: row.entry_type,
    status: row.status,
    sourceType: row.source_type,
    amountCents: row.amount_cents,
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    serviceOrderId: row.service_order_id,
    saleId: row.sale_id,
    packageId: row.customer_service_package_id,
    detailLabel,
  };
}

async function fetchAnalyticsEntries(
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<AnalyticsEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const byId = new Map<string, AnalyticsEntryRow>();

  const [createdResult, paidResult] = await Promise.all([
    supabase
      .from("financial_entries")
      .select(ANALYTICS_ENTRY_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabase
      .from("financial_entries")
      .select(ANALYTICS_ENTRY_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .not("paid_at", "is", null)
      .gte("paid_at", startIso)
      .lt("paid_at", endIso),
  ]);

  for (const row of [
    ...((createdResult.data as EntryQueryRow[] | null) ?? []),
    ...((paidResult.data as EntryQueryRow[] | null) ?? []),
  ]) {
    byId.set(row.id, mapEntryRow(row));
  }

  const paymentLinked = await supabase
    .from("financial_payments")
    .select("financial_entry_id")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .gte("paid_at", startIso)
    .lt("paid_at", endIso);

  const missingEntryIds = [...new Set((paymentLinked.data ?? []).map((row) => row.financial_entry_id))]
    .filter((entryId) => !byId.has(entryId));

  if (missingEntryIds.length > 0) {
    const { data: extraRows } = await supabase
      .from("financial_entries")
      .select(ANALYTICS_ENTRY_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .in("id", missingEntryIds);

    for (const row of (extraRows as EntryQueryRow[] | null) ?? []) {
      byId.set(row.id, mapEntryRow(row));
    }
  }

  return [...byId.values()];
}

async function fetchAnalyticsPayments(
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<AnalyticsPaymentRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_payments")
    .select("financial_entry_id, amount_cents, paid_at")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .gte("paid_at", startIso)
    .lt("paid_at", endIso);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    entryId: row.financial_entry_id,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
  }));
}

async function fetchSaleItems(
  companyId: string,
  saleIds: string[],
): Promise<AnalyticsSaleItemRow[]> {
  if (saleIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sale_items")
    .select("sale_id, product_name_snapshot, total_cents, cost_price_cents_snapshot, quantity")
    .eq("company_id", companyId)
    .in("sale_id", saleIds);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    saleId: row.sale_id,
    productName: row.product_name_snapshot,
    totalCents: row.total_cents,
    costCents: Math.round(Number(row.cost_price_cents_snapshot) * Number(row.quantity)),
  }));
}

export async function getFinancialAnalytics(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
  preset: FinanceAnalyticsPreset,
): Promise<FinanceAnalytics> {
  noStore();

  if (!isValidUuid(companyId)) {
    return buildFinancialAnalytics(
      {
        entries: [],
        payments: [],
        saleItems: [],
        periodStartIso: new Date(0).toISOString(),
        periodEndIso: new Date(0).toISOString(),
      },
      { from, to, preset },
      timeZone,
    );
  }

  const { start, endIso } = getPeriodBounds(from, to, timeZone);
  const [entries, payments] = await Promise.all([
    fetchAnalyticsEntries(companyId, start, endIso),
    fetchAnalyticsPayments(companyId, start, endIso),
  ]);

  const saleIds = [...new Set(entries.filter((entry) => entry.saleId).map((entry) => entry.saleId as string))];
  const saleItems = await fetchSaleItems(companyId, saleIds);

  return buildFinancialAnalytics(
    {
      entries,
      payments,
      saleItems,
      periodStartIso: start,
      periodEndIso: endIso,
    },
    { from, to, preset },
    timeZone,
  );
}

export async function getFinancialAnalyticsFromSearchParams(
  companyId: string,
  timeZone: string,
  params: {
    from?: string | null;
    to?: string | null;
    preset?: string | null;
  },
): Promise<FinanceAnalytics> {
  const period = resolveFinanceAnalyticsPeriod(params, timeZone);
  return getFinancialAnalytics(
    companyId,
    period.from,
    period.to,
    timeZone,
    period.preset,
  );
}

export { resolveFinanceAnalyticsPeriod };
