import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localDateTimeToUtcIso } from "@/lib/timezone";

import { DEFAULT_TIMEZONE, resolveCompanyTimeZone } from "@/lib/timezone";

import { getPreviousPeriod, resolveReportPeriod } from "./period";
import { periodDayCount } from "@/features/finance/analytics/period";

import type {
  AppointmentsReport,
  CustomerReport,
  EmployeePerformance,
  OccupancyReport,
  PdvReport,
  ReportOverview,
  RetentionReport,
  ServiceRanking,
  StockReport,
} from "./types";
import {
  computeAppointmentsReport,
  computeCustomerReport,
  computeEmployeePerformance,
  computeOccupancy,
  computeOverview,
  computePdvReport,
  computeRetentionReport,
  computeServiceRanking,
  computeStockReport,
} from "./engine";

function normalizeTimeZone(timeZone: string): string {
  return resolveCompanyTimeZone(timeZone);
}

const EMPTY_APPOINTMENTS_REPORT: AppointmentsReport = {
  total: 0,
  completed: 0,
  waiting: 0,
  cancelled: 0,
  noShow: 0,
  avgTicketCents: null,
  avgDurationMinutes: null,
  byDay: [],
};

const EMPTY_CUSTOMER_REPORT: CustomerReport = {
  activeCount: 0,
  newCount: 0,
  recurringCount: 0,
  topBySpend: [],
  topByVisits: [],
  inactiveCount: 0,
  inactiveDays: 60,
};

const EMPTY_RETENTION_REPORT: RetentionReport = {
  returnRate: 0,
  totalWithAppointments: 0,
  totalReturning: 0,
  explanation: "Nenhum dado disponível neste período.",
};

const EMPTY_OCCUPANCY_REPORT: OccupancyReport = {
  overallPercent: 0,
  totalSlotsAvailable: 0,
  totalSlotsUsed: 0,
  byWeekday: [],
  byHourBand: [],
};

const EMPTY_PDV_REPORT: PdvReport = {
  totalSoldCents: 0,
  salesCount: 0,
  avgTicketCents: null,
  grossProfitCents: 0,
  topProducts: [],
};

const EMPTY_STOCK_REPORT: StockReport = {
  estimatedValueCents: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  topExits: [],
  topEntries: [],
  losses: [],
  expiringSoon: [],
};

function emptyOverview(period: { from: string; to: string; preset: string }): ReportOverview {
  return computeOverview(
    {
      revenueCents: 0,
      incomeReceivedCents: 0,
      expensePaidCents: 0,
      appointmentsCount: 0,
      salesCount: 0,
      newCustomersCount: 0,
      cancellationsCount: 0,
      noShowCount: 0,
    },
    null,
    period,
    null,
  );
}

export function getReportPeriodBounds(
  from: string,
  to: string,
  timeZone: string,
): { utcFrom: string; utcTo: string } {
  const safeTimeZone = normalizeTimeZone(timeZone);
  const utcFrom = localDateTimeToUtcIso(from, "00:00", safeTimeZone);
  const utcTo = localDateTimeToUtcIso(to, "23:59", safeTimeZone);
  return { utcFrom, utcTo };
}

export async function getReportOverview(
  companyId: string,
  params: { from?: string | null; to?: string | null; preset?: string | null },
  timeZone: string,
): Promise<ReportOverview> {
  noStore();
  const safeTimeZone = normalizeTimeZone(timeZone);

  try {
    const period = resolveReportPeriod(params, safeTimeZone);
    const supabase = await createSupabaseServerClient();
    const { utcFrom, utcTo } = getReportPeriodBounds(period.from, period.to, safeTimeZone);
    const prev = getPreviousPeriod(period.from, period.to);
    const { utcFrom: prevUtcFrom, utcTo: prevUtcTo } = getReportPeriodBounds(
      prev.from,
      prev.to,
      safeTimeZone,
    );

    async function sumPaymentsForEntryType(
      entryType: "income" | "expense",
      paidStartIso: string,
      paidEndIso: string,
    ): Promise<number> {
      try {
        const { data: entries, error: entriesError } = await supabase
          .from("financial_entries")
          .select("id")
          .eq("company_id", companyId)
          .eq("entry_type", entryType)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .not("paid_at", "is", null)
          .gte("paid_at", paidStartIso)
          .lte("paid_at", paidEndIso);

        if (entriesError) return 0;

        const entryIds = (entries ?? []).map((e) => e.id);
        if (entryIds.length === 0) return 0;

        const { data: payments, error: paymentsError } = await supabase
          .from("financial_payments")
          .select("amount_cents")
          .eq("company_id", companyId)
          .is("cancelled_at", null)
          .in("financial_entry_id", entryIds)
          .gte("paid_at", paidStartIso)
          .lte("paid_at", paidEndIso);

        if (paymentsError) return 0;

        return (payments ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
      } catch {
        return 0;
      }
    }

    const [
      appointments,
      prevAppointments,
      sales,
      prevSales,
      customers,
      prevCustomers,
      incomeReceivedCents,
      expensePaidCents,
      prevIncomeReceivedCents,
      prevExpensePaidCents,
    ] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, status, price_cents_snapshot")
        .eq("company_id", companyId)
        .gte("scheduled_start", utcFrom)
        .lte("scheduled_start", utcTo),
      supabase
        .from("appointments")
        .select("id, status, price_cents_snapshot")
        .eq("company_id", companyId)
        .gte("scheduled_start", prevUtcFrom)
        .lte("scheduled_start", prevUtcTo),
      supabase
        .from("sales")
        .select("id, status")
        .eq("company_id", companyId)
        .in("status", ["completed", "partially_paid"])
        .gte("sold_at", utcFrom)
        .lte("sold_at", utcTo),
      supabase
        .from("sales")
        .select("id, status")
        .eq("company_id", companyId)
        .in("status", ["completed", "partially_paid"])
        .gte("sold_at", prevUtcFrom)
        .lte("sold_at", prevUtcTo),
      supabase
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", utcFrom)
        .lte("created_at", utcTo),
      supabase
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", prevUtcFrom)
        .lte("created_at", prevUtcTo),
      sumPaymentsForEntryType("income", utcFrom, utcTo),
      sumPaymentsForEntryType("expense", utcFrom, utcTo),
      sumPaymentsForEntryType("income", prevUtcFrom, prevUtcTo),
      sumPaymentsForEntryType("expense", prevUtcFrom, prevUtcTo),
    ]);

    const countByStatus = (rows: { status: string }[] | null, statuses: string[]) =>
      (rows ?? []).filter((r) => statuses.includes(r.status)).length;

    const completedAppts = (appointments.data ?? []).filter((a) => a.status === "completed");
    const prevCompletedAppts = (prevAppointments.data ?? []).filter((a) => a.status === "completed");

    const current = {
      revenueCents: completedAppts.reduce((s, a) => s + (a.price_cents_snapshot ?? 0), 0),
      incomeReceivedCents,
      expensePaidCents,
      appointmentsCount: completedAppts.length,
      salesCount: (sales.data ?? []).length,
      newCustomersCount: (customers.data ?? []).length,
      cancellationsCount: countByStatus(appointments.data, ["cancelled"]),
      noShowCount: countByStatus(appointments.data, ["no_show"]),
    };

    const prevData = {
      revenueCents: prevCompletedAppts.reduce((s, a) => s + (a.price_cents_snapshot ?? 0), 0),
      incomeReceivedCents: prevIncomeReceivedCents,
      expensePaidCents: prevExpensePaidCents,
      appointmentsCount: prevCompletedAppts.length,
      salesCount: (prevSales.data ?? []).length,
      newCustomersCount: (prevCustomers.data ?? []).length,
      cancellationsCount: countByStatus(prevAppointments.data, ["cancelled"]),
      noShowCount: countByStatus(prevAppointments.data, ["no_show"]),
    };

    return computeOverview(current, prevData, period, { ...prev, preset: period.preset });
  } catch {
    const period = resolveReportPeriod(params, safeTimeZone);
    return emptyOverview(period);
  }
}

export async function getAppointmentsReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const { data } = await supabase
    .from("appointments")
    .select("id, scheduled_start, status, service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot, pet_size, employee_id, customer_id, pet_id")
    .eq("company_id", companyId)
    .gte("scheduled_start", utcFrom)
    .lte("scheduled_start", utcTo);

  return data ?? [];
}

export async function getCustomersReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, customersResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, scheduled_start, status, price_cents_snapshot, customer_id, pet_id, employee_id, service_name_snapshot, duration_minutes_snapshot, pet_size")
      .eq("company_id", companyId)
      .gte("scheduled_start", utcFrom)
      .lte("scheduled_start", utcTo),
    supabase
      .from("customers")
      .select("id, name, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("created_at", utcFrom)
      .lte("created_at", utcTo),
  ]);

  return {
    appointments: appointmentsResult.data ?? [],
    customers: customersResult.data ?? [],
  };
}

export async function getPetsReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, petsResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, scheduled_start, status, pet_id, pet_size, customer_id, employee_id, service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot")
      .eq("company_id", companyId)
      .gte("scheduled_start", utcFrom)
      .lte("scheduled_start", utcTo),
    supabase
      .from("pets")
      .select("id, name, species, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("created_at", utcFrom)
      .lte("created_at", utcTo),
  ]);

  return {
    appointments: appointmentsResult.data ?? [],
    pets: petsResult.data ?? [],
  };
}

export async function getEmployeesReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, employeesResult, workingHoursResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, scheduled_start, status, price_cents_snapshot, employee_id, customer_id, pet_id, service_name_snapshot, duration_minutes_snapshot, pet_size")
      .eq("company_id", companyId)
      .gte("scheduled_start", utcFrom)
      .lte("scheduled_start", utcTo),
    supabase
      .from("employees")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("active", true)
      .is("deleted_at", null),
    supabase
      .from("employee_working_hours")
      .select("employee_id, weekday, enabled, start_time, end_time")
      .eq("company_id", companyId),
  ]);

  return {
    appointments: appointmentsResult.data ?? [],
    employees: employeesResult.data ?? [],
    workingHours: workingHoursResult.data ?? [],
  };
}

export async function getPdvReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [salesResult, itemsResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total_cents, status")
      .eq("company_id", companyId)
      .gte("sold_at", utcFrom)
      .lte("sold_at", utcTo),
    supabase
      .from("sale_items")
      .select("product_name_snapshot, unit_price_cents, quantity, total_cents, cost_price_cents_snapshot, sales!inner(company_id, sold_at)")
      .eq("sales.company_id", companyId)
      .gte("sales.sold_at", utcFrom)
      .lte("sales.sold_at", utcTo),
  ]);

  return {
    sales: salesResult.data ?? [],
    saleItems: itemsResult.data ?? [],
  };
}

export async function getStockReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [productsResult, movementsResult, batchesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, current_stock, cost_price_cents, track_stock")
      .eq("company_id", companyId)
      .is("archived_at", null),
    supabase
      .from("stock_movements")
      .select("product_id, type, quantity, products!inner(name, company_id)")
      .eq("products.company_id", companyId)
      .gte("created_at", utcFrom)
      .lte("created_at", utcTo),
    supabase
      .from("product_batches")
      .select("product_id, batch_code, expiration_date, quantity_remaining, products!inner(name, company_id)")
      .eq("products.company_id", companyId)
      .gt("quantity_remaining", 0),
  ]);

  return {
    products: productsResult.data ?? [],
    movements: (movementsResult.data ?? []).map((m) => ({
      ...m,
      product_name: (m.products as { name: string } | null)?.name,
    })),
    batches: (batchesResult.data ?? []).map((b) => ({
      product_id: b.product_id,
      batch_code: b.batch_code ?? "",
      expiration_date: b.expiration_date ?? "",
      quantity: b.quantity_remaining,
      product_name: (b.products as unknown as { name: string } | null)?.name,
    })),
  };
}

export async function getPackagesReportData(
  companyId: string,
  from: string,
  to: string,
  timeZone: string,
) {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { utcFrom, utcTo } = getReportPeriodBounds(from, to, timeZone);

  const [packagesResult, itemsResult] = await Promise.all([
    supabase
      .from("customer_service_packages")
      .select("id, status, price_cents_snapshot, purchased_at")
      .eq("company_id", companyId)
      .gte("purchased_at", utcFrom)
      .lte("purchased_at", utcTo),
    supabase
      .from("customer_service_package_items")
      .select("customer_package_id, quantity_total, quantity_used, customer_service_packages!inner(company_id, purchased_at)")
      .eq("customer_service_packages.company_id", companyId)
      .gte("customer_service_packages.purchased_at", utcFrom)
      .lte("customer_service_packages.purchased_at", utcTo),
  ]);

  const packages = packagesResult.data ?? [];
  const items = itemsResult.data ?? [];

  const itemsByPackage = new Map<string, Array<{ quantity_total: number; quantity_used: number }>>();
  for (const item of items) {
    const list = itemsByPackage.get(item.customer_package_id) ?? [];
    list.push({ quantity_total: item.quantity_total, quantity_used: item.quantity_used });
    itemsByPackage.set(item.customer_package_id, list);
  }

  return packages.map((pkg) => ({
    status: pkg.status,
    price_cents_snapshot: pkg.price_cents_snapshot,
    items: itemsByPackage.get(pkg.id) ?? [],
  }));
}

export async function getAppointmentsReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<AppointmentsReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const data = await getAppointmentsReportData(companyId, params.from, params.to, safeTimeZone);
    return computeAppointmentsReport(data, safeTimeZone);
  } catch {
    return EMPTY_APPOINTMENTS_REPORT;
  }
}

export async function getServiceRankings(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<ServiceRanking[]> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const data = await getAppointmentsReportData(companyId, params.from, params.to, safeTimeZone);
    return computeServiceRanking(data);
  } catch {
    return [];
  }
}

export async function getCustomerReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<CustomerReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { appointments, customers } = await getCustomersReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    return computeCustomerReport(appointments, customers);
  } catch {
    return EMPTY_CUSTOMER_REPORT;
  }
}

export async function getRetentionReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<RetentionReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const data = await getAppointmentsReportData(companyId, params.from, params.to, safeTimeZone);
    return computeRetentionReport(data);
  } catch {
    return EMPTY_RETENTION_REPORT;
  }
}

export async function getEmployeePerformance(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<EmployeePerformance[]> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { appointments, employees } = await getEmployeesReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    const dayCount = periodDayCount(params.from, params.to);
    return computeEmployeePerformance(appointments, employees, dayCount);
  } catch {
    return [];
  }
}

export async function getOccupancyReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<OccupancyReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { appointments, workingHours } = await getEmployeesReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    const dayCount = periodDayCount(params.from, params.to);
    return computeOccupancy(appointments, workingHours, dayCount, safeTimeZone);
  } catch {
    return EMPTY_OCCUPANCY_REPORT;
  }
}

export async function getPdvReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<PdvReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { sales, saleItems } = await getPdvReportData(companyId, params.from, params.to, safeTimeZone);
    const mappedItems = saleItems.map((item) => ({
      product_name_snapshot: item.product_name_snapshot,
      unit_price_cents: item.unit_price_cents,
      quantity: item.quantity,
      total_cents: item.total_cents,
      cost_price_cents_snapshot: item.cost_price_cents_snapshot,
    }));
    return computePdvReport(sales, mappedItems);
  } catch {
    return EMPTY_PDV_REPORT;
  }
}

export async function getStockReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<StockReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const data = await getStockReportData(companyId, params.from, params.to, safeTimeZone);
    return computeStockReport(data.products, data.movements, data.batches);
  } catch {
    return EMPTY_STOCK_REPORT;
  }
}
