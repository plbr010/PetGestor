import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { receivedCents, remainingCents } from "@/features/finance/ledger";
import type {
  FinancialEntryStatusFilter,
  FinancialEntryTypeFilter,
  FinancialSourceFilter,
  PaymentMethodFilter,
} from "@/features/finance/status";
import type {
  FinancialEntryDetail,
  FinancialEntryListItem,
  FinancialEntryPayment,
} from "@/features/finance/types";
import { computeFinancialSummary, getFinancialPeriodBounds } from "@/features/finance/utils";
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
import { getTodayInTimezone, addDaysToDateString } from "@/lib/timezone";

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

const ENTRY_SELECT_FLAT = `
  id, entry_type, status, source_type, service_order_id, description, category,
  amount_cents, due_date, paid_at, payment_method, notes, created_at, updated_at, cancelled_at
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

function mapFinancialEntryRow(
  row: FinancialEntryRow,
  payments: FinancialEntryPayment[] = [],
): FinancialEntryListItem {
  const serviceOrderRaw = unwrapJoin(row.service_orders);
  const appointmentRaw = serviceOrderRaw ? unwrapJoin(serviceOrderRaw.appointments) : null;
  const pet = appointmentRaw ? unwrapJoin(appointmentRaw.pets) : null;
  const customer = appointmentRaw ? unwrapJoin(appointmentRaw.customers) : null;
  const snapshot = {
    amountCents: row.amount_cents,
    status: row.status,
    payments: payments.map((payment) => ({
      entryId: row.id,
      amountCents: payment.amount_cents,
      paymentMethod: payment.payment_method,
      paidAt: payment.paid_at,
      cancelledAt: payment.cancelled_at,
    })),
  };

  return {
    id: row.id,
    entry_type: row.entry_type,
    status: row.status,
    source_type: row.source_type as FinancialEntryListItem["source_type"],
    service_order_id: row.service_order_id,
    description: row.description,
    category: row.category,
    amount_cents: row.amount_cents,
    received_cents: receivedCents(snapshot),
    remaining_cents: remainingCents(snapshot),
    due_date: row.due_date,
    paid_at: row.paid_at,
    payment_method: row.payment_method,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelled_at: row.cancelled_at,
    payments,
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
  const { start, endExclusive } = getFinancialPeriodBounds(from, to, timeZone);
  return { start, end: endExclusive };
}

type PaymentRow = {
  id: string;
  financial_entry_id: string;
  amount_cents: number;
  payment_method: PaymentMethod;
  paid_at: string;
  cancelled_at: string | null;
};

async function fetchPaymentsForEntries(
  companyId: string,
  entryIds: string[],
): Promise<Map<string, FinancialEntryPayment[]>> {
  const byEntry = new Map<string, FinancialEntryPayment[]>();

  if (entryIds.length === 0 || !isValidUuid(companyId)) {
    return byEntry;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("id, financial_entry_id, amount_cents, payment_method, paid_at, cancelled_at")
    .eq("company_id", companyId)
    .in("financial_entry_id", entryIds);

  if (error) {
    return byEntry;
  }

  for (const row of (data as PaymentRow[] | null) ?? []) {
    const list = byEntry.get(row.financial_entry_id) ?? [];
    list.push({
      id: row.id,
      amount_cents: row.amount_cents,
      payment_method: row.payment_method,
      paid_at: row.paid_at,
      cancelled_at: row.cancelled_at,
    });
    byEntry.set(row.financial_entry_id, list);
  }

  return byEntry;
}

function mapRowsWithPayments(
  rows: FinancialEntryRow[] | null,
  paymentsByEntry: Map<string, FinancialEntryPayment[]>,
): FinancialEntryListItem[] {
  return (rows ?? []).map((row) => mapFinancialEntryRow(row, paymentsByEntry.get(row.id) ?? []));
}

async function resolvePaymentFilterEntryIds(
  companyId: string,
  payment: PaymentMethodFilter | undefined,
): Promise<string[] | null> {
  if (!payment || payment === "all") {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("financial_entry_id")
    .eq("company_id", companyId)
    .eq("payment_method", payment)
    .is("cancelled_at", null);

  if (error) {
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.financial_entry_id))];
}

type FinancialEntryQueryParams = {
  companyId: string;
  start?: string;
  end?: string;
  type?: FinancialEntryTypeFilter;
  status?: FinancialEntryStatusFilter;
  statuses?: FinancialEntryStatus[];
  payment?: PaymentMethodFilter;
  paymentEntryIds?: string[];
  source?: FinancialSourceFilter;
  drillCategory?: string;
  search?: string;
  rangeFrom?: number;
  rangeTo?: number;
  limit?: number;
  orderByCreatedDesc?: boolean;
  orderByDueDateAsc?: boolean;
};

function applyFinancialEntryFilters(
  // Supabase builder types are too strict for a shared filter helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: any,
  params: FinancialEntryQueryParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = builder.eq("company_id", params.companyId).is("deleted_at", null);

  if (params.start && params.end) {
    next = next.gte("created_at", params.start).lt("created_at", params.end);
  }

  if (params.type && params.type !== "all") {
    next = next.eq("entry_type", params.type);
  }

  if (params.statuses && params.statuses.length > 0) {
    next = next.in("status", params.statuses);
  } else if (params.status && params.status !== "all") {
    next = next.eq("status", params.status);
  }

  if (params.source && params.source !== "all") {
    next = next.eq("source_type", params.source);
  }

  if (params.drillCategory) {
    next = next.eq("entry_type", "expense").ilike("category", params.drillCategory);
  }

  if (params.payment && params.payment !== "all") {
    const ids = params.paymentEntryIds ?? [];
    if (ids.length > 0) {
      next = next.or(`payment_method.eq.${params.payment},id.in.(${ids.join(",")})`);
    } else {
      next = next.eq("payment_method", params.payment);
    }
  }

  if (params.search) {
    next = next.or(`description.ilike.%${params.search}%,category.ilike.%${params.search}%`);
  }

  if (params.orderByCreatedDesc) {
    next = next.order("created_at", { ascending: false });
  }

  if (params.orderByDueDateAsc) {
    next = next.order("due_date", { ascending: true, nullsFirst: false });
  }

  if (params.rangeFrom !== undefined && params.rangeTo !== undefined) {
    next = next.range(params.rangeFrom, params.rangeTo);
  }

  if (params.limit !== undefined) {
    next = next.limit(params.limit);
  }

  return next;
}

async function queryFinancialEntries(
  select: string,
  params: FinancialEntryQueryParams,
  options?: { count?: "exact" },
) {
  const supabase = await createSupabaseServerClient();
  const builder = applyFinancialEntryFilters(
    supabase.from("financial_entries").select(select, options),
    params,
  );

  return builder;
}

async function queryFinancialEntriesWithFallback(
  params: FinancialEntryQueryParams,
  options?: { count?: "exact" },
) {
  const joined = await queryFinancialEntries(ENTRY_SELECT, params, options);
  if (!joined.error) {
    return joined;
  }

  return queryFinancialEntries(ENTRY_SELECT_FLAT, params, options);
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

  const { start, end } = getPeriodBounds(from, to, timeZone);
  const search = sanitizeSearchTerm(query);
  const { from: rangeFrom, to: rangeTo } = getPaginationRange(page, pageSize);
  const paymentEntryIds = await resolvePaymentFilterEntryIds(companyId, payment);

  const { data, error, count } = await queryFinancialEntriesWithFallback(
    {
      companyId,
      start,
      end,
      type,
      status,
      payment,
      paymentEntryIds: paymentEntryIds ?? undefined,
      source,
      drillCategory,
      search,
      rangeFrom,
      rangeTo,
      orderByCreatedDesc: true,
    },
    { count: "exact" },
  );

  if (error) {
    return buildPaginatedResult([], 0, page, pageSize);
  }

  const rows = (data as FinancialEntryRow[] | null) ?? [];
  const paymentsByEntry = await fetchPaymentsForEntries(
    companyId,
    rows.map((row) => row.id),
  );

  return buildPaginatedResult(
    mapRowsWithPayments(rows, paymentsByEntry),
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
  const { start, end } = getPeriodBounds(from, to, timeZone);

  const { data, error } = await queryFinancialEntriesWithFallback({
    companyId,
    start,
    end,
  });

  if (error) {
    return [];
  }

  const rows = (data as FinancialEntryRow[] | null) ?? [];
  const paymentsByEntry = await fetchPaymentsForEntries(
    companyId,
    rows.map((row) => row.id),
  );
  return mapRowsWithPayments(rows, paymentsByEntry);
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

  const { data, error } = await queryFinancialEntriesWithFallback({
    companyId,
    type: "income",
    statuses: ["pending", "partially_paid"],
    limit: Math.max(limit * 3, 30),
    orderByDueDateAsc: true,
  });

  if (error) {
    return [];
  }

  const rows = ((data as FinancialEntryRow[] | null) ?? []).filter(
    (row) => row.status === "pending" || row.status === "partially_paid",
  );
  const paymentsByEntry = await fetchPaymentsForEntries(
    companyId,
    rows.map((row) => row.id),
  );

  return mapRowsWithPayments(rows, paymentsByEntry)
    .filter((entry) => entry.remaining_cents > 0)
    .slice(0, limit);
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

  const paymentsByEntry = await fetchPaymentsForEntries(companyId, [entryId]);
  return mapFinancialEntryRow(data as FinancialEntryRow, paymentsByEntry.get(entryId) ?? []);
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

  const row = data as FinancialEntryRow;
  const paymentsByEntry = await fetchPaymentsForEntries(companyId, [row.id]);
  return mapFinancialEntryRow(row, paymentsByEntry.get(row.id) ?? []);
}

export async function getPendingReceivablesTotal(companyId: string): Promise<number> {
  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("financial_entries")
    .select("id, amount_cents, status")
    .eq("company_id", companyId)
    .eq("entry_type", "income")
    .in("status", ["pending", "partially_paid"])
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    amount_cents: number;
    status: FinancialEntryStatus;
  }>;
  const paymentsByEntry = await fetchPaymentsForEntries(
    companyId,
    rows.map((row) => row.id),
  );

  return rows.reduce((sum, row) => {
    const snapshot = {
      amountCents: row.amount_cents,
      status: row.status,
      payments: (paymentsByEntry.get(row.id) ?? []).map((payment) => ({
        entryId: row.id,
        amountCents: payment.amount_cents,
        paymentMethod: payment.payment_method,
        paidAt: payment.paid_at,
        cancelledAt: payment.cancelled_at,
      })),
    };
    return sum + remainingCents(snapshot);
  }, 0);
}

export async function sumReceivedForEntryType(
  companyId: string,
  entryType: "income" | "expense",
  from: string,
  to: string,
  timeZone: string,
): Promise<number> {
  noStore();

  if (!isValidUuid(companyId)) {
    return 0;
  }

  const { start, end } = getPeriodBounds(from, to, timeZone);
  const supabase = await createSupabaseServerClient();

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("financial_payments")
    .select("amount_cents, financial_entry_id")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .gte("paid_at", start)
    .lt("paid_at", end);

  if (paymentsError) {
    return 0;
  }

  const paymentEntryIds = [...new Set((paymentRows ?? []).map((row) => row.financial_entry_id))];
  const typeByEntry = new Map<string, "income" | "expense">();

  if (paymentEntryIds.length > 0) {
    const { data: typedEntries, error: typedError } = await supabase
      .from("financial_entries")
      .select("id, entry_type")
      .eq("company_id", companyId)
      .in("id", paymentEntryIds)
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (!typedError) {
      for (const row of typedEntries ?? []) {
        typeByEntry.set(row.id, row.entry_type);
      }
    }
  }

  let total = (paymentRows ?? []).reduce((sum, row) => {
    if (typeByEntry.get(row.financial_entry_id) !== entryType) {
      return sum;
    }
    return sum + (row.amount_cents ?? 0);
  }, 0);

  const { data: paidEntries, error: paidError } = await supabase
    .from("financial_entries")
    .select("id, amount_cents")
    .eq("company_id", companyId)
    .eq("entry_type", entryType)
    .eq("status", "paid")
    .is("deleted_at", null)
    .not("paid_at", "is", null)
    .gte("paid_at", start)
    .lt("paid_at", end);

  if (paidError || !paidEntries || paidEntries.length === 0) {
    return total;
  }

  const paidIds = paidEntries.map((row) => row.id);
  const { data: existingPayments, error: existingError } = await supabase
    .from("financial_payments")
    .select("financial_entry_id")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .in("financial_entry_id", paidIds);

  if (existingError) {
    return total;
  }

  const withPayments = new Set((existingPayments ?? []).map((row) => row.financial_entry_id));
  for (const row of paidEntries) {
    if (!withPayments.has(row.id)) {
      total += row.amount_cents;
    }
  }

  return total;
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
    const [year, month] = today.split("-");
    const monthFrom = `${year}-${month}-01`;
    const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
    const nextYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
    const monthTo = addDaysToDateString(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
      -1,
    );

    const [
      incomePaidTodayCents,
      incomePaidMonthCents,
      expensePaidMonthCents,
      pendingReceivablesCents,
      monthlySummary,
    ] = await Promise.all([
      sumReceivedForEntryType(companyId, "income", today, today, timeZone),
      sumReceivedForEntryType(companyId, "income", monthFrom, monthTo, timeZone),
      sumReceivedForEntryType(companyId, "expense", monthFrom, monthTo, timeZone),
      getPendingReceivablesTotal(companyId),
      getMonthlyFinancialSummary(companyId, today, timeZone),
    ]);

    return {
      incomePaidTodayCents,
      pendingReceivablesCents,
      expensePaidMonthCents,
      realizedResultMonthCents: incomePaidMonthCents - expensePaidMonthCents,
      monthlySummary: {
        ...monthlySummary,
        incomePaidCents: incomePaidMonthCents,
        expensePaidCents: expensePaidMonthCents,
        realizedResultCents: incomePaidMonthCents - expensePaidMonthCents,
      },
    };
  } catch (error) {
    console.error("[finance:dashboard]", error);
    return empty;
  }
}

export { parsePageParam };