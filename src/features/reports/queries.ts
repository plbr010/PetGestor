import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { sumReceivedForEntryType } from "@/features/finance/queries";
import { periodDayCount } from "@/features/finance/analytics/period";
import { getPackageFinancialStatusMap } from "@/features/service-packages/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE, getTodayInTimezone, resolveCompanyTimeZone } from "@/lib/timezone";

import { getPreviousPeriod, getReportPeriodBounds, resolveReportPeriod } from "./period";
import {
  computeAppointmentsReport,
  computeCancellations,
  computeCustomerReport,
  computeEmployeePerformance,
  computeOccupancy,
  computeOverview,
  computePackagesReport,
  computePdvReport,
  computePetReport,
  computeRetentionReport,
  computeServiceRanking,
  computeStockReport,
} from "./engine";
import type {
  AppointmentsReport,
  CancellationReport,
  CustomerReport,
  EmployeePerformance,
  OccupancyReport,
  PackagesReport,
  PdvReport,
  PetReport,
  ReportOverview,
  RetentionReport,
  ServiceRanking,
  StockReport,
} from "./types";
import { VALID_PDV_SALE_STATUSES } from "./types";

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
  overallServedPercent: 0,
  capacityMinutes: 0,
  reservedMinutes: 0,
  servedMinutes: 0,
  noShowMinutes: 0,
  cancelledMinutes: 0,
  totalSlotsAvailable: 0,
  totalSlotsUsed: 0,
  reservedAppointmentCount: 0,
  servedAppointmentCount: 0,
  noShowCount: 0,
  cancelledCount: 0,
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
  expired: [],
  expiresToday: [],
  expiringSoon: [],
  unknownMovements: [],
  reconciliation: [],
  reconciliationDivergenceCount: 0,
};

const EMPTY_PACKAGES_REPORT: PackagesReport = {
  soldCount: 0,
  billedCents: 0,
  receivedCents: 0,
  revenueCents: 0,
  pendingCount: 0,
  activeCount: 0,
  expiredCount: 0,
  fullyUsedCount: 0,
  cancelledCount: 0,
  totalCreditsRemaining: 0,
  inconsistencies: [],
};

const EMPTY_PET_REPORT: PetReport = {
  attendedCount: 0,
  newCount: 0,
  topByVisits: [],
  bySpecies: [],
  bySize: [],
};

const EMPTY_CANCELLATION_REPORT: CancellationReport = {
  total: 0,
  noShowTotal: 0,
  ratePercent: 0,
  byDay: [],
  topCustomers: [],
};

const APPOINTMENT_SELECT =
  "id, scheduled_start, status, service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot, pet_size, employee_id, customer_id, pet_id";

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

export { getReportPeriodBounds };

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
    const { start, endExclusive } = getReportPeriodBounds(period.from, period.to, safeTimeZone);
    const prev = getPreviousPeriod(period.from, period.to);
    const { start: prevStart, endExclusive: prevEndExclusive } = getReportPeriodBounds(
      prev.from,
      prev.to,
      safeTimeZone,
    );

    async function sumPaymentsForEntryType(
      entryType: "income" | "expense",
      periodFrom: string,
      periodTo: string,
    ): Promise<number> {
      return sumReceivedForEntryType(companyId, entryType, periodFrom, periodTo, safeTimeZone);
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
        .is("deleted_at", null)
        .gte("scheduled_start", start)
        .lt("scheduled_start", endExclusive),
      supabase
        .from("appointments")
        .select("id, status, price_cents_snapshot")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("scheduled_start", prevStart)
        .lt("scheduled_start", prevEndExclusive),
      supabase
        .from("sales")
        .select("id, status")
        .eq("company_id", companyId)
        .in("status", [...VALID_PDV_SALE_STATUSES])
        .gte("sold_at", start)
        .lt("sold_at", endExclusive),
      supabase
        .from("sales")
        .select("id, status")
        .eq("company_id", companyId)
        .in("status", [...VALID_PDV_SALE_STATUSES])
        .gte("sold_at", prevStart)
        .lt("sold_at", prevEndExclusive),
      supabase
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", start)
        .lt("created_at", endExclusive),
      supabase
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", prevStart)
        .lt("created_at", prevEndExclusive),
      sumPaymentsForEntryType("income", period.from, period.to),
      sumPaymentsForEntryType("expense", period.from, period.to),
      sumPaymentsForEntryType("income", prev.from, prev.to),
      sumPaymentsForEntryType("expense", prev.from, prev.to),
    ]);

    const countByStatus = (rows: { status: string }[] | null, statuses: string[]) =>
      (rows ?? []).filter((row) => statuses.includes(row.status)).length;

    const completedAppts = (appointments.data ?? []).filter((row) => row.status === "completed");
    const prevCompletedAppts = (prevAppointments.data ?? []).filter((row) => row.status === "completed");

    const current = {
      revenueCents: completedAppts.reduce((sum, row) => sum + (row.price_cents_snapshot ?? 0), 0),
      incomeReceivedCents,
      expensePaidCents,
      appointmentsCount: completedAppts.length,
      salesCount: (sales.data ?? []).length,
      newCustomersCount: (customers.data ?? []).length,
      cancellationsCount: countByStatus(appointments.data, ["cancelled"]),
      noShowCount: countByStatus(appointments.data, ["no_show"]),
    };

    const prevData = {
      revenueCents: prevCompletedAppts.reduce((sum, row) => sum + (row.price_cents_snapshot ?? 0), 0),
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const { data } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("scheduled_start", start)
    .lt("scheduled_start", endExclusive);

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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, customersResult, newCustomersResult] = await Promise.all([
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("scheduled_start", start)
      .lt("scheduled_start", endExclusive),
    supabase
      .from("customers")
      .select("id, name, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("created_at", start)
      .lt("created_at", endExclusive),
  ]);

  return {
    appointments: appointmentsResult.data ?? [],
    customers: customersResult.data ?? [],
    newCount: (newCustomersResult.data ?? []).length,
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, petsResult, newPetsResult] = await Promise.all([
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("scheduled_start", start)
      .lt("scheduled_start", endExclusive),
    supabase
      .from("pets")
      .select("id, name, species, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("pets")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("created_at", start)
      .lt("created_at", endExclusive),
  ]);

  return {
    appointments: appointmentsResult.data ?? [],
    pets: petsResult.data ?? [],
    newCount: (newPetsResult.data ?? []).length,
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [appointmentsResult, employeesResult, workingHoursResult] = await Promise.all([
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("scheduled_start", start)
      .lt("scheduled_start", endExclusive),
    supabase
      .from("employees")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("active", true)
      .is("deleted_at", null),
    supabase
      .from("employee_working_hours")
      .select("employee_id, weekday, enabled, start_time, end_time, break_start, break_end")
      .eq("company_id", companyId),
  ]);

  const employees = employeesResult.data ?? [];
  const employeeIds = new Set(employees.map((employee) => employee.id));

  return {
    appointments: appointmentsResult.data ?? [],
    employees,
    workingHours: (workingHoursResult.data ?? []).filter((row) => employeeIds.has(row.employee_id)),
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [salesResult, itemsResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total_cents, status")
      .eq("company_id", companyId)
      .gte("sold_at", start)
      .lt("sold_at", endExclusive),
    supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, product_name_snapshot, unit_price_cents, quantity, total_cents, cost_price_cents_snapshot, sales!inner(company_id, sold_at, status)",
      )
      .eq("sales.company_id", companyId)
      .in("sales.status", [...VALID_PDV_SALE_STATUSES])
      .gte("sales.sold_at", start)
      .lt("sales.sold_at", endExclusive),
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [productsResult, movementsResult, batchesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, current_stock, cost_price_cents, track_stock, unit, archived_at")
      .eq("company_id", companyId),
    supabase
      .from("stock_movements")
      .select(
        "product_id, type, quantity, previous_quantity, new_quantity, reason, unit_cost_cents, created_at, products!inner(name, company_id, unit)",
      )
      .eq("products.company_id", companyId),
    supabase
      .from("product_batches")
      .select("product_id, batch_code, expiration_date, quantity_remaining, products!inner(name, company_id, unit, archived_at)")
      .eq("products.company_id", companyId)
      .gt("quantity_remaining", 0),
  ]);

  return {
    products: productsResult.data ?? [],
    movements: (movementsResult.data ?? []).map((movement) => ({
      ...movement,
      product_name: (movement.products as { name: string } | null)?.name,
    })),
    batches: (batchesResult.data ?? [])
      .filter((batch) => {
        const product = batch.products as { archived_at?: string | null } | null;
        return !product?.archived_at;
      })
      .map((batch) => {
        const product = batch.products as { name: string; unit?: string } | null;
        return {
          product_id: batch.product_id,
          batch_code: batch.batch_code ?? "",
          expiration_date: batch.expiration_date ?? "",
          quantity: batch.quantity_remaining,
          product_name: product?.name,
          unit: product?.unit,
        };
      }),
    periodStart: start,
    periodEndExclusive: endExclusive,
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
  const { start, endExclusive } = getReportPeriodBounds(from, to, timeZone);

  const [packagesResult, itemsResult] = await Promise.all([
    supabase
      .from("customer_service_packages")
      .select("id, status, price_cents_snapshot, purchased_at, expires_at")
      .eq("company_id", companyId)
      .gte("purchased_at", start)
      .lt("purchased_at", endExclusive),
    supabase
      .from("customer_service_package_items")
      .select(
        "customer_package_id, quantity_total, quantity_used, customer_service_packages!inner(company_id, purchased_at)",
      )
      .eq("customer_service_packages.company_id", companyId)
      .gte("customer_service_packages.purchased_at", start)
      .lt("customer_service_packages.purchased_at", endExclusive),
  ]);

  const packages = packagesResult.data ?? [];
  const items = itemsResult.data ?? [];
  const financialByPackage = await getPackageFinancialStatusMap(
    companyId,
    packages.map((pkg) => pkg.id),
  );

  const itemsByPackage = new Map<string, Array<{ quantity_total: number; quantity_used: number }>>();
  for (const item of items) {
    const list = itemsByPackage.get(item.customer_package_id) ?? [];
    list.push({ quantity_total: item.quantity_total, quantity_used: item.quantity_used });
    itemsByPackage.set(item.customer_package_id, list);
  }

  return packages.map((pkg) => ({
    id: pkg.id,
    status: pkg.status,
    financialStatus: financialByPackage.get(pkg.id) ?? null,
    price_cents_snapshot: pkg.price_cents_snapshot,
    expires_at: pkg.expires_at,
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
    const { appointments, customers, newCount } = await getCustomersReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    return computeCustomerReport(appointments, customers, 60, newCount);
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
    const { appointments, customers } = await getCustomersReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    return computeRetentionReport(appointments, new Set(customers.map((customer) => customer.id)));
  } catch {
    return EMPTY_RETENTION_REPORT;
  }
}

export async function getPetReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<PetReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { appointments, pets, newCount } = await getPetsReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    return computePetReport(appointments, pets, newCount);
  } catch {
    return EMPTY_PET_REPORT;
  }
}

export async function getCancellationsReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<CancellationReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { appointments, customers } = await getCustomersReportData(
      companyId,
      params.from,
      params.to,
      safeTimeZone,
    );
    return computeCancellations(
      appointments,
      safeTimeZone,
      new Map(customers.map((customer) => [customer.id, customer.name])),
    );
  } catch {
    return EMPTY_CANCELLATION_REPORT;
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
    return computeOccupancy(appointments, workingHours, params, safeTimeZone);
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
      sale_id: item.sale_id,
      product_id: item.product_id,
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
    return computeStockReport(data.products, data.movements, data.batches, {
      today: getTodayInTimezone(safeTimeZone),
      periodStart: data.periodStart,
      periodEndExclusive: data.periodEndExclusive,
      allMovements: data.movements,
    });
  } catch {
    return EMPTY_STOCK_REPORT;
  }
}

export async function getPackagesReport(
  companyId: string,
  params: { from: string; to: string },
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<PackagesReport> {
  try {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const packages = await getPackagesReportData(companyId, params.from, params.to, safeTimeZone);
    return computePackagesReport(packages, getTodayInTimezone(safeTimeZone), safeTimeZone);
  } catch {
    return EMPTY_PACKAGES_REPORT;
  }
}
