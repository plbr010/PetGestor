import { resolveDisplayStatus } from "@/features/service-packages/utils";
import type { CustomerPackageStatus, PackageFinancialStatus } from "@/features/service-packages/types";
import { roundQuantity } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_SHORT_LABELS, type ProductUnit } from "@/features/inventory/units";
import {
  formatUtcDateInTimezone,
  getWeekdayInTimezone,
  resolveCompanyTimeZone,
} from "@/lib/timezone";

import { safeDivide, safePercent } from "./math";
import {
  addCategoryQuantity,
  classifyBatchExpiration,
  classifyStockMovement,
  emptyCategoryTotals,
  periodNetFromCategories,
  type StockAnalyticCategory,
} from "./stock-classification";
import type {
  AppointmentsReport,
  CancellationReport,
  CustomerReport,
  EmployeePerformance,
  HourDistribution,
  PackageInconsistency,
  PackagesReport,
  PdvReport,
  PetReport,
  ReportOverview,
  RetentionReport,
  ServiceRanking,
  StockExpiringRow,
  StockLossRow,
  StockReconciliationRow,
  StockReport,
  WeekdayDistribution,
} from "./types";
import { VALID_PDV_SALE_STATUSES } from "./types";

export { safeDivide, safePercent } from "./math";
export { computeOccupancy } from "./occupancy";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const HOUR_BANDS = ["08-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22"];

type OverviewData = {
  revenueCents: number;
  incomeReceivedCents: number;
  expensePaidCents: number;
  appointmentsCount: number;
  salesCount: number;
  newCustomersCount: number;
  cancellationsCount: number;
  noShowCount: number;
};

export function computeOverview(
  current: OverviewData,
  prev: OverviewData | null,
  period: { from: string; to: string; preset: string },
  prevPeriod: { from: string; to: string; preset: string } | null,
): ReportOverview {
  return {
    period,
    prev: prevPeriod,
    revenueCents: current.revenueCents,
    prevRevenueCents: prev?.revenueCents ?? null,
    incomeReceivedCents: current.incomeReceivedCents,
    prevIncomeReceivedCents: prev?.incomeReceivedCents ?? null,
    expensePaidCents: current.expensePaidCents,
    prevExpensePaidCents: prev?.expensePaidCents ?? null,
    netResultCents: current.incomeReceivedCents - current.expensePaidCents,
    prevNetResultCents: prev ? prev.incomeReceivedCents - prev.expensePaidCents : null,
    appointmentsCount: current.appointmentsCount,
    prevAppointmentsCount: prev?.appointmentsCount ?? null,
    avgTicketCents: safeDivide(current.revenueCents, current.appointmentsCount),
    prevAvgTicketCents: prev ? safeDivide(prev.revenueCents, prev.appointmentsCount) : null,
    salesCount: current.salesCount,
    prevSalesCount: prev?.salesCount ?? null,
    newCustomersCount: current.newCustomersCount,
    prevNewCustomersCount: prev?.newCustomersCount ?? null,
    cancellationsCount: current.cancellationsCount,
    prevCancellationsCount: prev?.cancellationsCount ?? null,
    noShowCount: current.noShowCount,
    prevNoShowCount: prev?.noShowCount ?? null,
  };
}

type AppointmentRow = {
  id: string;
  scheduled_start: string;
  status: string;
  service_name_snapshot: string | null;
  price_cents_snapshot: number | null;
  duration_minutes_snapshot: number | null;
  pet_size: string | null;
  employee_id: string | null;
  customer_id: string | null;
  pet_id: string | null;
};

export function computeServiceRanking(appointments: AppointmentRow[]): ServiceRanking[] {
  const completed = appointments.filter((a) => a.status === "completed");
  const map = new Map<string, { count: number; revenueCents: number }>();

  for (const a of completed) {
    const name = a.service_name_snapshot ?? "Sem nome";
    const entry = map.get(name) ?? { count: 0, revenueCents: 0 };
    entry.count += 1;
    entry.revenueCents += a.price_cents_snapshot ?? 0;
    map.set(name, entry);
  }

  const totalRevenue = completed.reduce((s, a) => s + (a.price_cents_snapshot ?? 0), 0);
  const result: ServiceRanking[] = [];

  for (const [serviceName, data] of map) {
    result.push({
      serviceName,
      count: data.count,
      revenueCents: data.revenueCents,
      percentOfTotal: safePercent(data.revenueCents, totalRevenue),
    });
  }

  return result.sort((a, b) => b.revenueCents - a.revenueCents);
}

export function computeAppointmentsReport(
  appointments: AppointmentRow[],
  timeZone: string,
): AppointmentsReport {
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled");
  const noShow = appointments.filter((a) => a.status === "no_show");
  const waiting = appointments.filter((a) =>
    ["scheduled", "confirmed", "in_progress"].includes(a.status),
  );

  const totalPrice = completed.reduce((s, a) => s + (a.price_cents_snapshot ?? 0), 0);
  const totalDuration = completed.reduce((s, a) => s + (a.duration_minutes_snapshot ?? 0), 0);

  const dayMap = new Map<string, number>();
  for (const a of appointments) {
    const date = formatUtcDateInTimezone(a.scheduled_start, timeZone);
    dayMap.set(date, (dayMap.get(date) ?? 0) + 1);
  }

  const byDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      count,
    }));

  return {
    total: appointments.length,
    completed: completed.length,
    waiting: waiting.length,
    cancelled: cancelled.length,
    noShow: noShow.length,
    avgTicketCents: safeDivide(totalPrice, completed.length),
    avgDurationMinutes: safeDivide(totalDuration, completed.length),
    byDay,
  };
}

type CustomerRow = { id: string; name: string; created_at: string };

export function computeCustomerReport(
  appointments: AppointmentRow[],
  customers: CustomerRow[],
  inactiveDays: number = 60,
  newCount?: number,
): CustomerReport {
  const knownCustomers = new Set(customers.map((customer) => customer.id));
  const validAppointments = appointments.filter(
    (a) => a.status !== "cancelled" && a.customer_id && knownCustomers.has(a.customer_id),
  );

  const customerAppointments = new Map<string, number>();
  const customerSpend = new Map<string, number>();

  for (const a of validAppointments) {
    const cid = a.customer_id!;
    customerAppointments.set(cid, (customerAppointments.get(cid) ?? 0) + 1);
    if (a.status === "completed") {
      customerSpend.set(cid, (customerSpend.get(cid) ?? 0) + (a.price_cents_snapshot ?? 0));
    }
  }

  const cutoff = new Date(Date.now() - inactiveDays * 86_400_000).toISOString();
  const recentCustomers = new Set(
    validAppointments
      .filter((a) => a.scheduled_start >= cutoff)
      .map((a) => a.customer_id!),
  );

  const allWithAppointments = new Set(validAppointments.map((a) => a.customer_id!));
  const inactiveCount = Array.from(allWithAppointments).filter(
    (cid) => !recentCustomers.has(cid),
  ).length;

  const recurring = Array.from(customerAppointments.entries()).filter(
    ([, count]) => count >= 2,
  );

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const topBySpend = Array.from(customerSpend.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, totalCents]) => ({
      id,
      name: customerMap.get(id)?.name ?? "Desconhecido",
      totalCents,
      count: customerAppointments.get(id) ?? 0,
    }));

  const topByVisits = Array.from(customerAppointments.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({
      id,
      name: customerMap.get(id)?.name ?? "Desconhecido",
      count,
    }));

  return {
    activeCount: recentCustomers.size,
    newCount: newCount ?? customers.length,
    recurringCount: recurring.length,
    topBySpend,
    topByVisits,
    inactiveCount,
    inactiveDays,
  };
}

export function computeRetentionReport(
  appointments: AppointmentRow[],
  knownCustomerIds?: Set<string>,
): RetentionReport {
  const valid = appointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.customer_id &&
      (!knownCustomerIds || knownCustomerIds.has(a.customer_id)),
  );
  const customerCounts = new Map<string, number>();

  for (const a of valid) {
    const cid = a.customer_id!;
    customerCounts.set(cid, (customerCounts.get(cid) ?? 0) + 1);
  }

  const totalWithAppointments = customerCounts.size;
  const totalReturning = Array.from(customerCounts.values()).filter((c) => c >= 2).length;
  const returnRate = safePercent(totalReturning, totalWithAppointments);

  return {
    returnRate,
    totalWithAppointments,
    totalReturning,
    explanation: `${totalReturning} de ${totalWithAppointments} clientes retornaram (2+ agendamentos)`,
  };
}

type PetRow = { id: string; name: string; species: string; created_at: string };

export function computePetReport(
  appointments: AppointmentRow[],
  pets: PetRow[],
  newCount?: number,
): PetReport {
  const knownPets = new Set(pets.map((pet) => pet.id));
  const valid = appointments.filter((a) => a.status !== "cancelled" && a.pet_id && knownPets.has(a.pet_id));
  const petVisits = new Map<string, number>();
  const petSizes = new Map<string, number>();

  for (const a of valid) {
    petVisits.set(a.pet_id!, (petVisits.get(a.pet_id!) ?? 0) + 1);
    if (a.pet_size) {
      petSizes.set(a.pet_size, (petSizes.get(a.pet_size) ?? 0) + 1);
    }
  }

  const petMap = new Map(pets.map((p) => [p.id, p]));
  const attendedIds = new Set(valid.map((a) => a.pet_id!));

  const speciesMap = new Map<string, number>();
  for (const pid of attendedIds) {
    const pet = petMap.get(pid);
    if (pet) {
      speciesMap.set(pet.species, (speciesMap.get(pet.species) ?? 0) + 1);
    }
  }

  const topByVisits = Array.from(petVisits.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => {
      const pet = petMap.get(id);
      return { id, name: pet?.name ?? "Desconhecido", species: pet?.species ?? "other", count };
    });

  return {
    attendedCount: attendedIds.size,
    newCount: newCount ?? pets.length,
    topByVisits,
    bySpecies: Array.from(speciesMap.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count),
    bySize: Array.from(petSizes.entries())
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => b.count - a.count),
  };
}

type EmployeeRow = { id: string; name: string };

export function computeEmployeePerformance(
  appointments: AppointmentRow[],
  employees: EmployeeRow[],
  dayCount: number,
): EmployeePerformance[] {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const stats = new Map<string, { count: number; revenue: number; cancellations: number }>();

  for (const a of appointments) {
    if (!a.employee_id || !empMap.has(a.employee_id)) continue;
    const entry = stats.get(a.employee_id) ?? { count: 0, revenue: 0, cancellations: 0 };
    if (a.status === "completed") {
      entry.count += 1;
      entry.revenue += a.price_cents_snapshot ?? 0;
    } else if (a.status === "cancelled" || a.status === "no_show") {
      entry.cancellations += 1;
    }
    stats.set(a.employee_id, entry);
  }

  return Array.from(stats.entries())
    .map(([employeeId, data]) => ({
      employeeId,
      employeeName: empMap.get(employeeId)?.name ?? "Desconhecido",
      appointmentsCount: data.count,
      revenueCents: data.revenue,
      avgPerDay: dayCount > 0 ? Math.round((data.count / dayCount) * 100) / 100 : 0,
      cancellations: data.cancellations,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export function computeCancellations(
  appointments: AppointmentRow[],
  timeZone: string,
  customerNames?: Map<string, string>,
): CancellationReport {
  const cancelled = appointments.filter((a) => a.status === "cancelled");
  const noShow = appointments.filter((a) => a.status === "no_show");
  const total = cancelled.length;
  const noShowTotal = noShow.length;
  const ratePercent = safePercent(total + noShowTotal, appointments.length);

  const dayMap = new Map<string, { cancelled: number; noShow: number }>();
  for (const a of [...cancelled, ...noShow]) {
    const date = formatUtcDateInTimezone(a.scheduled_start, timeZone);
    const entry = dayMap.get(date) ?? { cancelled: 0, noShow: 0 };
    if (a.status === "cancelled") entry.cancelled += 1;
    else entry.noShow += 1;
    dayMap.set(date, entry);
  }

  const byDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      cancelled: data.cancelled,
      noShow: data.noShow,
    }));

  const customerCancels = new Map<string, number>();
  for (const a of [...cancelled, ...noShow]) {
    if (a.customer_id) {
      customerCancels.set(a.customer_id, (customerCancels.get(a.customer_id) ?? 0) + 1);
    }
  }

  const topCustomers = Array.from(customerCancels.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({
      id,
      name: customerNames?.get(id) ?? id,
      count,
    }));

  return { total, noShowTotal, ratePercent, byDay, topCustomers };
}

export function computeWeekdayDistribution(
  appointments: AppointmentRow[],
  timeZone: string,
): WeekdayDistribution {
  const valid = appointments.filter((a) => a.status === "completed");
  const map = new Map<number, { count: number; revenueCents: number }>();

  for (const a of valid) {
    const wd = getWeekdayInTimezone(a.scheduled_start, timeZone);
    const entry = map.get(wd) ?? { count: 0, revenueCents: 0 };
    entry.count += 1;
    entry.revenueCents += a.price_cents_snapshot ?? 0;
    map.set(wd, entry);
  }

  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    label: WEEKDAY_LABELS[i],
    count: map.get(i)?.count ?? 0,
    revenueCents: map.get(i)?.revenueCents ?? 0,
  }));
}

export function computeHourDistribution(
  appointments: AppointmentRow[],
  timeZone: string,
): HourDistribution {
  const valid = appointments.filter((a) => a.status !== "cancelled");
  const bandCounts = new Map<string, number>();

  for (const a of valid) {
    const date = new Date(a.scheduled_start);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolveCompanyTimeZone(timeZone),
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const bandStart = Math.floor(hour / 2) * 2;
    const bandEnd = bandStart + 2;
    const band = `${String(bandStart).padStart(2, "0")}-${String(bandEnd).padStart(2, "0")}`;
    if (HOUR_BANDS.includes(band)) {
      bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    }
  }

  return HOUR_BANDS.map((band) => ({ band, count: bandCounts.get(band) ?? 0 }));
}

export function isValidPdvSaleStatus(status: string): boolean {
  return (VALID_PDV_SALE_STATUSES as readonly string[]).includes(status);
}

type SaleRow = { id: string; total_cents: number; status: string };
type SaleItemRow = {
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  cost_price_cents_snapshot: number | null;
};

export function computePdvReport(sales: SaleRow[], saleItems: SaleItemRow[]): PdvReport {
  const completedSales = sales.filter((sale) => isValidPdvSaleStatus(sale.status));
  const validSaleIds = new Set(completedSales.map((sale) => sale.id));
  const totalSoldCents = completedSales.reduce((sum, sale) => sum + sale.total_cents, 0);
  const salesCount = completedSales.length;

  const productMap = new Map<
    string,
    { name: string; units: number; revenue: number; cost: number }
  >();

  for (const item of saleItems) {
    if (!validSaleIds.has(item.sale_id)) {
      continue;
    }
    const entry = productMap.get(item.product_id) ?? {
      name: item.product_name_snapshot,
      units: 0,
      revenue: 0,
      cost: 0,
    };
    entry.name = item.product_name_snapshot;
    entry.units += item.quantity;
    entry.revenue += item.total_cents;
    entry.cost += (item.cost_price_cents_snapshot ?? 0) * item.quantity;
    productMap.set(item.product_id, entry);
  }

  const grossProfitCents = Array.from(productMap.values()).reduce(
    (sum, product) => sum + (product.revenue - product.cost),
    0,
  );

  const topProducts = Array.from(productMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([productId, data]) => ({
      productId,
      name: data.name,
      unitsSold: data.units,
      revenueCents: data.revenue,
      profitCents: data.revenue - data.cost,
    }));

  return {
    totalSoldCents,
    salesCount,
    avgTicketCents: safeDivide(totalSoldCents, salesCount),
    grossProfitCents,
    topProducts,
  };
}

type ProductRow = {
  id: string;
  name: string;
  current_stock: number;
  cost_price_cents: number;
  track_stock: boolean;
  unit?: string;
  archived_at?: string | null;
};

type MovementRow = {
  product_id: string;
  type: string;
  quantity: number;
  previous_quantity?: number | null;
  new_quantity?: number | null;
  reason?: string | null;
  unit_cost_cents?: number | null;
  created_at?: string;
  product_name?: string;
};

type BatchRow = {
  product_id: string;
  batch_code: string;
  expiration_date: string;
  quantity: number;
  product_name?: string;
  unit?: string;
};

function unitLabel(unit: string | undefined): string {
  if (unit && unit in PRODUCT_UNIT_SHORT_LABELS) {
    return PRODUCT_UNIT_SHORT_LABELS[unit as ProductUnit];
  }
  return "un";
}

export function computeStockReport(
  products: ProductRow[],
  movements: MovementRow[],
  batches: BatchRow[],
  options?: {
    today: string;
    periodStart?: string;
    periodEndExclusive?: string;
    allMovements?: MovementRow[];
  },
): StockReport {
  const today = options?.today;
  const periodStart = options?.periodStart;
  const periodEndExclusive = options?.periodEndExclusive;
  const tracked = products.filter((product) => product.track_stock);
  const operational = tracked.filter((product) => !product.archived_at);
  const estimatedValueCents = operational.reduce(
    (sum, product) => sum + product.current_stock * product.cost_price_cents,
    0,
  );
  const lowStockCount = operational.filter(
    (product) => product.current_stock > 0 && product.current_stock <= 5,
  ).length;
  const outOfStockCount = operational.filter((product) => product.current_stock <= 0).length;

  const productMap = new Map(products.map((product) => [product.id, product]));

  const exitMap = new Map<string, { name: string; quantity: number }>();
  const entryMap = new Map<string, { name: string; quantity: number }>();
  const losses: StockLossRow[] = [];
  const unknownMovements: StockReport["unknownMovements"] = [];

  const periodTotalsByProduct = new Map<string, Record<StockAnalyticCategory, number>>();
  const allTimeSignedByProduct = new Map<string, number>();
  const beforePeriodSignedByProduct = new Map<string, number>();
  const unknownSignedByProduct = new Map<string, number>();

  function ensurePeriodTotals(productId: string) {
    const existing = periodTotalsByProduct.get(productId);
    if (existing) {
      return existing;
    }
    const created = emptyCategoryTotals();
    periodTotalsByProduct.set(productId, created);
    return created;
  }

  function inPeriod(createdAt: string | undefined): boolean {
    if (!periodStart || !periodEndExclusive || !createdAt) {
      return true;
    }
    return createdAt >= periodStart && createdAt < periodEndExclusive;
  }

  function beforePeriod(createdAt: string | undefined): boolean {
    if (!periodStart || !createdAt) {
      return false;
    }
    return createdAt < periodStart;
  }

  const history = options?.allMovements ?? movements;

  for (const movement of history) {
    const classified = classifyStockMovement({
      type: movement.type,
      quantity: movement.quantity,
      previousQuantity: movement.previous_quantity,
      newQuantity: movement.new_quantity,
    });
    const product = productMap.get(movement.product_id);
    const name = movement.product_name ?? product?.name ?? "Desconhecido";

    allTimeSignedByProduct.set(
      movement.product_id,
      roundQuantity((allTimeSignedByProduct.get(movement.product_id) ?? 0) + classified.signedQuantity),
    );

    if (beforePeriod(movement.created_at)) {
      beforePeriodSignedByProduct.set(
        movement.product_id,
        roundQuantity(
          (beforePeriodSignedByProduct.get(movement.product_id) ?? 0) + classified.signedQuantity,
        ),
      );
    }

    if (!inPeriod(movement.created_at)) {
      continue;
    }

    const totals = ensurePeriodTotals(movement.product_id);
    addCategoryQuantity(totals, classified.category, classified.absoluteQuantity);

    if (classified.category === "unknown") {
      unknownSignedByProduct.set(
        movement.product_id,
        roundQuantity((unknownSignedByProduct.get(movement.product_id) ?? 0) + classified.signedQuantity),
      );
      unknownMovements.push({
        productId: movement.product_id,
        productName: name,
        type: movement.type,
        quantity: classified.absoluteQuantity,
      });
    }

    if (classified.category === "exit" || classified.category === "sale") {
      const current = exitMap.get(movement.product_id) ?? { name, quantity: 0 };
      current.name = name;
      current.quantity = roundQuantity(current.quantity + classified.absoluteQuantity);
      exitMap.set(movement.product_id, current);
    }

    if (classified.category === "entry" || classified.category === "return") {
      const current = entryMap.get(movement.product_id) ?? { name, quantity: 0 };
      current.name = name;
      current.quantity = roundQuantity(current.quantity + classified.absoluteQuantity);
      entryMap.set(movement.product_id, current);
    }

    if (classified.category === "loss") {
      const estimated =
        movement.unit_cost_cents != null
          ? Math.round(movement.unit_cost_cents * classified.absoluteQuantity)
          : product
            ? Math.round(product.cost_price_cents * classified.absoluteQuantity)
            : null;
      losses.push({
        productId: movement.product_id,
        productName: name,
        quantity: classified.absoluteQuantity,
        unit: unitLabel(product?.unit),
        reason: movement.reason ?? null,
        estimatedCostCents: estimated,
      });
    }
  }

  const topExits = Array.from(exitMap.entries())
    .sort(([, a], [, b]) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(([productId, data]) => ({ productId, name: data.name, quantity: data.quantity }));

  const topEntries = Array.from(entryMap.entries())
    .sort(([, a], [, b]) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(([productId, data]) => ({ productId, name: data.name, quantity: data.quantity }));

  const lossByProduct = new Map<string, StockLossRow>();
  for (const loss of losses) {
    const current = lossByProduct.get(loss.productId);
    if (!current) {
      lossByProduct.set(loss.productId, { ...loss });
      continue;
    }
    current.quantity = roundQuantity(current.quantity + loss.quantity);
    current.estimatedCostCents =
      current.estimatedCostCents != null && loss.estimatedCostCents != null
        ? current.estimatedCostCents + loss.estimatedCostCents
        : (current.estimatedCostCents ?? loss.estimatedCostCents);
    if (!current.reason && loss.reason) {
      current.reason = loss.reason;
    }
  }

  const aggregatedLosses = Array.from(lossByProduct.values()).sort((a, b) => b.quantity - a.quantity);

  const expired: StockExpiringRow[] = [];
  const expiresToday: StockExpiringRow[] = [];
  const expiringSoon: StockExpiringRow[] = [];

  if (today) {
    for (const batch of batches) {
      if (batch.quantity <= 0) {
        continue;
      }
      const bucket = classifyBatchExpiration(batch.expiration_date, today);
      if (bucket === "ok" || bucket === "no_date") {
        continue;
      }
      const product = productMap.get(batch.product_id);
      const row: StockExpiringRow = {
        productId: batch.product_id,
        productName: batch.product_name ?? product?.name ?? "Desconhecido",
        batchCode: batch.batch_code,
        expirationDate: batch.expiration_date.slice(0, 10),
        quantity: batch.quantity,
        unit: unitLabel(batch.unit ?? product?.unit),
        bucket,
      };
      if (bucket === "expired") {
        expired.push(row);
      } else if (bucket === "expires_today") {
        expiresToday.push(row);
      } else {
        expiringSoon.push(row);
      }
    }
    expired.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
    expiresToday.sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR"));
    expiringSoon.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
  }

  const reconciliation: StockReconciliationRow[] = tracked.map((product) => {
    const totals = periodTotalsByProduct.get(product.id) ?? emptyCategoryTotals();
    const opening = beforePeriodSignedByProduct.get(product.id) ?? 0;
    const closingFromMovements = roundQuantity(
      opening + periodNetFromCategories(totals) + (unknownSignedByProduct.get(product.id) ?? 0),
    );
    const allTimeFromMovements = allTimeSignedByProduct.get(product.id) ?? 0;
    const divergence = roundQuantity(product.current_stock - allTimeFromMovements);

    return {
      productId: product.id,
      productName: product.name,
      opening,
      entries: totals.entry,
      returns: totals.return,
      adjustmentPositive: totals.adjustment_positive,
      sales: totals.sale,
      internalUse: totals.internal_use,
      exits: totals.exit,
      losses: totals.loss,
      adjustmentNegative: totals.adjustment_negative,
      unknown: totals.unknown,
      closingFromMovements,
      currentStock: product.current_stock,
      allTimeFromMovements,
      divergence,
      hasLegacyDivergence: divergence !== 0,
    };
  });

  return {
    estimatedValueCents,
    lowStockCount,
    outOfStockCount,
    topExits,
    topEntries,
    losses: aggregatedLosses.slice(0, 50),
    expired: expired.slice(0, 50),
    expiresToday: expiresToday.slice(0, 50),
    expiringSoon: expiringSoon.slice(0, 50),
    unknownMovements,
    reconciliation,
    reconciliationDivergenceCount: reconciliation.filter((row) => row.hasLegacyDivergence).length,
  };
}

type PackageRow = {
  id?: string;
  status: CustomerPackageStatus | string;
  financialStatus?: PackageFinancialStatus | null;
  price_cents_snapshot: number;
  expires_at?: string;
  items: Array<{ quantity_total: number; quantity_used: number }>;
};

export function computePackagesReport(
  packages: PackageRow[],
  today: string,
  timeZone: string,
): PackagesReport {
  let soldCount = 0;
  let billedCents = 0;
  let receivedCents = 0;
  let pendingCount = 0;
  let activeCount = 0;
  let expiredCount = 0;
  let fullyUsedCount = 0;
  let cancelledCount = 0;
  let totalCreditsRemaining = 0;
  const inconsistencies: PackageInconsistency[] = [];

  for (const pkg of packages) {
    const remaining = pkg.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity_total - item.quantity_used),
      0,
    );
    const operational = pkg.status as CustomerPackageStatus;
    const financial = pkg.financialStatus ?? null;
    const expiresAt = (pkg.expires_at ?? "9999-12-31").slice(0, 10);
    const display = resolveDisplayStatus(
      operational,
      expiresAt,
      remaining,
      timeZone,
      financial,
      today,
    );

    if (operational === "cancelled" && financial === "paid") {
      inconsistencies.push({
        kind: "cancelled_paid_legacy",
        packageId: pkg.id ?? "",
        detail: "Pacote cancelled com receita paid — legado; excluído de ativos/vendas.",
      });
      cancelledCount += 1;
      continue;
    }

    if (display === "cancelled") {
      cancelledCount += 1;
      continue;
    }

    soldCount += 1;
    billedCents += pkg.price_cents_snapshot;

    if (display === "pending_payment") {
      pendingCount += 1;
      continue;
    }

    if (financial === "paid") {
      receivedCents += pkg.price_cents_snapshot;
    }

    if (display === "fully_used") {
      fullyUsedCount += 1;
      continue;
    }

    if (display === "expired") {
      expiredCount += 1;
      continue;
    }

    activeCount += 1;
    totalCreditsRemaining += remaining;
  }

  return {
    soldCount,
    billedCents,
    receivedCents,
    revenueCents: receivedCents,
    pendingCount,
    activeCount,
    expiredCount,
    fullyUsedCount,
    cancelledCount,
    totalCreditsRemaining,
    inconsistencies,
  };
}

export { formatCsvRow, toCsv } from "./csv";
