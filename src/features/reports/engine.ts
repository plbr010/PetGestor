import {
  formatUtcDateInTimezone,
  getWeekdayInTimezone,
  resolveCompanyTimeZone,
} from "@/lib/timezone";

import type {
  AppointmentsReport,
  CancellationReport,
  CustomerReport,
  EmployeePerformance,
  HourDistribution,
  OccupancyReport,
  PackagesReport,
  PdvReport,
  PetReport,
  ReportOverview,
  RetentionReport,
  ServiceRanking,
  StockReport,
  WeekdayDistribution,
} from "./types";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const HOUR_BANDS = ["08-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22"];

export function safePercent(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 10000) / 100;
}

export function safeDivide(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round(num / den);
}

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
): CustomerReport {
  const validAppointments = appointments.filter(
    (a) => a.status !== "cancelled" && a.customer_id,
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
    newCount: customers.length,
    recurringCount: recurring.length,
    topBySpend,
    topByVisits,
    inactiveCount,
    inactiveDays,
  };
}

export function computeRetentionReport(appointments: AppointmentRow[]): RetentionReport {
  const valid = appointments.filter(
    (a) => a.status !== "cancelled" && a.customer_id,
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

export function computePetReport(appointments: AppointmentRow[], pets: PetRow[]): PetReport {
  const valid = appointments.filter((a) => a.status !== "cancelled" && a.pet_id);
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
    newCount: pets.length,
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
    if (!a.employee_id) continue;
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

type WorkingHourRow = { employee_id: string; weekday: number; enabled: boolean; start_time: string | null; end_time: string | null };

export function computeOccupancy(
  appointments: AppointmentRow[],
  workingHours: WorkingHourRow[],
  dayCount: number,
  timeZone: string,
): OccupancyReport {
  const slotDuration = 30;
  const enabledHours = workingHours.filter((wh) => wh.enabled);

  let totalSlotsAvailable = 0;
  const weekdaySlots = new Map<number, number>();

  for (const wh of enabledHours) {
    if (!wh.start_time || !wh.end_time) continue;
    const [sh, sm] = wh.start_time.split(":").map(Number);
    const [eh, em] = wh.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const slots = Math.max(0, Math.floor((endMin - startMin) / slotDuration));
    const weeksInPeriod = Math.max(1, Math.floor(dayCount / 7));
    const contribution = slots * weeksInPeriod;
    totalSlotsAvailable += contribution;
    weekdaySlots.set(wh.weekday, (weekdaySlots.get(wh.weekday) ?? 0) + contribution);
  }

  const valid = appointments.filter((a) => a.status !== "cancelled");
  const totalSlotsUsed = valid.length;

  const weekdayCounts = new Map<number, number>();
  const hourBandCounts = new Map<string, number>();

  for (const a of valid) {
    const wd = getWeekdayInTimezone(a.scheduled_start, timeZone);
    weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);

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
      hourBandCounts.set(band, (hourBandCounts.get(band) ?? 0) + 1);
    }
  }

  const byWeekday = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    label: WEEKDAY_LABELS[i],
    percent: safePercent(weekdayCounts.get(i) ?? 0, weekdaySlots.get(i) ?? 0),
    count: weekdayCounts.get(i) ?? 0,
  }));

  const byHourBand = HOUR_BANDS.map((band) => ({
    band,
    count: hourBandCounts.get(band) ?? 0,
  }));

  return {
    overallPercent: safePercent(totalSlotsUsed, totalSlotsAvailable),
    totalSlotsAvailable,
    totalSlotsUsed,
    byWeekday,
    byHourBand,
  };
}

export function computeCancellations(
  appointments: AppointmentRow[],
  timeZone: string,
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
    .map(([id, count]) => ({ id, name: id, count }));

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

type SaleRow = { id: string; total_cents: number; status: string };
type SaleItemRow = {
  product_name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  cost_price_cents_snapshot: number | null;
};

export function computePdvReport(sales: SaleRow[], saleItems: SaleItemRow[]): PdvReport {
  const completedSales = sales.filter((s) => s.status === "completed" || s.status === "partially_paid");
  const totalSoldCents = completedSales.reduce((s, sale) => s + sale.total_cents, 0);
  const salesCount = completedSales.length;

  const productMap = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const item of saleItems) {
    const entry = productMap.get(item.product_name_snapshot) ?? { units: 0, revenue: 0, cost: 0 };
    entry.units += item.quantity;
    entry.revenue += item.total_cents;
    entry.cost += (item.cost_price_cents_snapshot ?? 0) * item.quantity;
    productMap.set(item.product_name_snapshot, entry);
  }

  const grossProfitCents = Array.from(productMap.values()).reduce(
    (s, p) => s + (p.revenue - p.cost),
    0,
  );

  const topProducts = Array.from(productMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([name, data]) => ({
      name,
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

type ProductRow = { id: string; name: string; current_stock: number; cost_price_cents: number; track_stock: boolean };
type MovementRow = { product_id: string; type: string; quantity: number; product_name?: string };
type BatchRow = { product_id: string; batch_code: string; expiration_date: string; quantity: number; product_name?: string };

export function computeStockReport(
  products: ProductRow[],
  movements: MovementRow[],
  batches: BatchRow[],
): StockReport {
  const tracked = products.filter((p) => p.track_stock);
  const estimatedValueCents = tracked.reduce(
    (s, p) => s + p.current_stock * p.cost_price_cents,
    0,
  );
  const lowStockCount = tracked.filter((p) => p.current_stock > 0 && p.current_stock <= 5).length;
  const outOfStockCount = tracked.filter((p) => p.current_stock <= 0).length;

  const productMap = new Map(products.map((p) => [p.id, p]));

  const exitMap = new Map<string, number>();
  const entryMap = new Map<string, number>();
  const lossMap = new Map<string, number>();

  for (const m of movements) {
    const name = m.product_name ?? productMap.get(m.product_id)?.name ?? "Desconhecido";
    if (m.type === "exit" || m.type === "sale_exit") {
      exitMap.set(name, (exitMap.get(name) ?? 0) + m.quantity);
    } else if (m.type === "entry" || m.type === "return") {
      entryMap.set(name, (entryMap.get(name) ?? 0) + m.quantity);
    } else if (m.type === "loss") {
      lossMap.set(name, (lossMap.get(name) ?? 0) + m.quantity);
    }
  }

  const topExits = Array.from(exitMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));

  const topEntries = Array.from(entryMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));

  const losses = Array.from(lossMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const expiringSoon = batches
    .filter((b) => b.quantity > 0 && b.expiration_date <= thirtyDaysLater)
    .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
    .slice(0, 10)
    .map((b) => ({
      productName: b.product_name ?? productMap.get(b.product_id)?.name ?? "Desconhecido",
      batchCode: b.batch_code,
      expirationDate: b.expiration_date,
      quantity: b.quantity,
    }));

  return { estimatedValueCents, lowStockCount, outOfStockCount, topExits, topEntries, losses, expiringSoon };
}

type PackageRow = {
  status: string;
  price_cents_snapshot: number;
  items: Array<{ quantity_total: number; quantity_used: number }>;
};

export function computePackagesReport(packages: PackageRow[]): PackagesReport {
  const soldCount = packages.length;
  const revenueCents = packages.reduce((s, p) => s + p.price_cents_snapshot, 0);
  const activeCount = packages.filter((p) => p.status === "active").length;
  const fullyUsedCount = packages.filter((p) => p.status === "fully_used").length;

  let totalCreditsRemaining = 0;
  for (const pkg of packages.filter((p) => p.status === "active")) {
    for (const item of pkg.items) {
      totalCreditsRemaining += Math.max(0, item.quantity_total - item.quantity_used);
    }
  }

  return { soldCount, revenueCents, activeCount, fullyUsedCount, totalCreditsRemaining };
}

export { formatCsvRow, toCsv } from "./csv";
