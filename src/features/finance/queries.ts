import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type {
  FinancialEntryStatusFilter,
  FinancialEntryTypeFilter,
  FinancialSourceFilter,
  PaymentMethodFilter,
} from "@/features/finance/status";
import type { FinancialEntryDetail, FinancialEntryListItem } from "@/features/finance/types";
import { computeFinancialSummary } from "@/features/finance/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import { isValidUuid } from "@/lib/security/uuid";
import type { FinancialEntryStatus, FinancialEntryType, PaymentMethod } from "@/types/database.types";
import { localDateTimeToUtcIso, addDaysToDateString, getTodayInTimezone } from "@/lib/timezone";

const ENTRY_SELECT = `
  id, entry_type, status, source_type, service_order_id, description, category,
  amount_cents, due_date, paid_at, payment_method, notes, created_at, updated_at, cancelled_at,
  service_orders(
    id,
    appointments(
      pets(name),
      customers(name)
    )
  )
`;

type FinancialEntryRow = {
  id: string;
  entry_type: FinancialEntryType;
  status: FinancialEntryStatus;
  source_type: string;
  service_order_id: string | null;
  description: string;
  category: string | null;
  amount_cents: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  service_orders: ServiceOrderJoin | ServiceOrderJoin[] | null;
};

type ServiceOrderJoin = {
  id: string;
  appointments: {
    pets: { name: string } | { name: string }[];
    customers: { name: string } | { name: string }[];
  } | {
    pets: { name: string } | { name: string }[];
    customers: { name: string } | { name: string }[];
  }[];
};

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapFinancialEntryRow(row: FinancialEntryRow): FinancialEntryListItem {
  const serviceOrderRaw = unwrapJoin(row.service_orders);
  const appointmentRaw = serviceOrderRaw ? unwrapJoin(serviceOrderRaw.appointments) : null;
  const pet = appointmentRaw ? unwrapJoin(appointmentRaw.pets) : null;
  const customer = appointmentRaw ? unwrapJoin(appointmentRaw.customers) : null;

  return {
    id: row.id,
    entry_type: row.entry_type,
    status: row.status,
    source_type: row.source_type as FinancialEntryListItem["source_type"],
    service_order_id: row.service_order_id,
    description: row.description,
    category: row.category,
    amount_cents: row.amount_cents,
    due_date: row.due_date,
    paid_at: row.paid_at,
    payment_method: row.payment_method,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelled_at: row.cancelled_at,
    service_order:
      serviceOrderRaw && pet && customer
        ? {
            id: serviceOrderRaw.id,
            appointment: {
              pet: { name: pet.name },
              customer: { name: customer.name },
            },
          }
        : null,
  };
}

function getPeriodBounds(from: string, to: string, timeZone: string) {
  const start = localDateTimeToUtcIso(from, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(to, 1), "00:00", timeZone);
  return { start, end };
}

type GetFinancialEntriesParams = {
  companyId: string;
  from: string;
  to: string;
  timeZone: string;
  page?: number;
  pageSize?: number;
  type?: FinancialEntryTypeFilter;
  status?: FinancialEntryStatusFilter;
  payment?: PaymentMethodFilter;
  source?: FinancialSourceFilter;
  drillCategory?: string;
  query?: string;
};

export async function getFinancialEntries({
  companyId,
  from,
  to,
  timeZone,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  type = "all",
  status = "all",
  payment = "all",
  source = "all",
  drillCategory,
  query,
}: GetFinancialEntriesParams): Promise<PaginatedResult<FinancialEntryListItem>> {
  noStore();

  if (!isValidUuid(companyId)) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const { start, end } = getPeriodBounds(from, to, timeZone);
  const search = sanitizeSearchTerm(query);
  const { from: rangeFrom, to: rangeTo } = getPaginationRange(page, pageSize);

  let builder = supabase
    .from("financial_entries")
    .select(ENTRY_SELECT, { count: "exact" })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (type !== "all") {
    builder = builder.eq("entry_type", type);
  }

  if (status !== "all") {
    builder = builder.eq("status", status);
  }

  if (source !== "all") {
    builder = builder.eq("source_type", source);
  }

  if (drillCategory) {
    builder = builder.eq("entry_type", "expense").ilike("category", drillCategory);
  }

  if (payment !== "all") {
    builder = builder.eq("payment_method", payment);
  }

  if (search) {
    builder = builder.or(`description.ilike.%${search}%,category.ilike.%${search}%`);
  }

  const { data, error, count } = await builder;

  if (error) {
    throw new Error("Não foi possível carregar os lançamentos financeiros.");
  }

  return buildPaginatedResult(
    (data as FinancialEntryRow[] | null)?.map(mapFinancialEntryRow) ?? [],
    count ?? 0,
    page,
    pageSize,
  );
}

async function fetchEntriesInPeriod(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
): Promise<FinancialEntryListItem[]> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { start, end } = getPeriodBounds(from, to, timeZone);

  const { data, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_SELECT)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) {
    throw new Error("Não foi possível carregar o resumo financeiro.");
  }

  return (data as FinancialEntryRow[] | null)?.map(mapFinancialEntryRow) ?? [];
}

export async function getFinancialSummary(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  const entries = await fetchEntriesInPeriod(companyId, from, to, timeZone);
  return computeFinancialSummary(entries);
}

export async function getDailyFinancialSummary(
  companyId: string,
  date: string,
  timeZone: string,
) {
  return getFinancialSummary(companyId, date, date, timeZone);
}

export async function getMonthlyFinancialSummary(
  companyId: string,
  monthAnchor: string,
  timeZone: string,
) {
  const [year, month] = monthAnchor.split("-");
  const from = `${year}-${month}-01`;
  const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
  const nextYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const to = addDaysToDateString(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    -1,
  );

  return getFinancialSummary(companyId, from, to, timeZone);
}

export async function getPendingReceivables(companyId: string, limit = 10) {
  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_SELECT)
    .eq("company_id", companyId)
    .eq("entry_type", "income")
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data as FinancialEntryRow[] | null)?.map(mapFinancialEntryRow) ?? [];
}

export async function getFinancialEntryById(
  companyId: string,
  entryId: string,
): Promise<FinancialEntryDetail | null> {
  noStore();

  if (!isValidUuid(entryId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_SELECT)
    .eq("company_id", companyId)
    .eq("id", entryId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapFinancialEntryRow(data as FinancialEntryRow);
}

export async function requireFinancialEntryById(
  companyId: string,
  entryId: string,
): Promise<FinancialEntryDetail> {
  const entry = await getFinancialEntryById(companyId, entryId);

  if (!entry) {
    notFound();
  }

  return entry;
}

export async function getFinancialEntryByServiceOrderId(
  companyId: string,
  serviceOrderId: string,
): Promise<FinancialEntryDetail | null> {
  noStore();

  if (!isValidUuid(serviceOrderId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_SELECT)
    .eq("company_id", companyId)
    .eq("service_order_id", serviceOrderId)
    .eq("source_type", "service_order")
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapFinancialEntryRow(data as FinancialEntryRow);
}

export async function getPendingReceivablesTotal(companyId: string): Promise<number> {
  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_entries")
    .select("amount_cents")
    .eq("company_id", companyId)
    .eq("entry_type", "income")
    .eq("status", "pending")
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + row.amount_cents, 0);
}

export async function getDashboardFinanceMetrics(companyId: string, timeZone: string) {
  const empty = {
    incomePaidTodayCents: 0,
    pendingReceivablesCents: 0,
    expensePaidMonthCents: 0,
    realizedResultMonthCents: 0,
    monthlySummary: {
      incomePaidCents: 0,
      incomePendingCents: 0,
      expensePaidCents: 0,
      expensePendingCents: 0,
      realizedResultCents: 0,
      projectedResultCents: 0,
    },
  };

  try {
    const today = getTodayInTimezone(timeZone);

    const [dailySummary, monthlySummary, pendingReceivablesCents] = await Promise.all([
      getDailyFinancialSummary(companyId, today, timeZone),
      getMonthlyFinancialSummary(companyId, today, timeZone),
      getPendingReceivablesTotal(companyId),
    ]);

    return {
      incomePaidTodayCents: dailySummary.incomePaidCents,
      pendingReceivablesCents,
      expensePaidMonthCents: monthlySummary.expensePaidCents,
      realizedResultMonthCents: monthlySummary.realizedResultCents,
      monthlySummary,
    };
  } catch (error) {
    console.error("[finance:dashboard]", error);
    return empty;
  }
}

export { parsePageParam };
