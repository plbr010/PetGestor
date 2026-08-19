import { describe, expect, it } from "vitest";

import {
  computeAppointmentsReport,
  computeCancellations,
  computeCustomerReport,
  computeEmployeePerformance,
  computeHourDistribution,
  computeOccupancy,
  computeOverview,
  computePackagesReport,
  computePdvReport,
  computePetReport,
  computeRetentionReport,
  computeServiceRanking,
  computeStockReport,
  computeWeekdayDistribution,
  safeDivide,
  safePercent,
} from "@/features/reports/engine";
import { toCsv } from "@/features/reports/csv";
import { resolveReportPeriod, getPreviousPeriod, periodLabel } from "@/features/reports/period";

const PERIOD = { from: "2026-08-01", to: "2026-08-31", preset: "month" };
const PREV_PERIOD = { from: "2026-07-01", to: "2026-07-31", preset: "month" };
const TZ = "America/Sao_Paulo";

function apt(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides.id as string) ?? "a1",
    scheduled_start: (overrides.scheduled_start as string) ?? "2026-08-15T13:00:00.000Z",
    status: (overrides.status as string) ?? "completed",
    service_name_snapshot: (overrides.service_name_snapshot as string) ?? "Banho",
    price_cents_snapshot: (overrides.price_cents_snapshot as number) ?? 5000,
    duration_minutes_snapshot: (overrides.duration_minutes_snapshot as number) ?? 60,
    pet_size: (overrides.pet_size as string | null) ?? null,
    employee_id: (overrides.employee_id as string) ?? "e1",
    customer_id: (overrides.customer_id as string) ?? "c1",
    pet_id: (overrides.pet_id as string) ?? "p1",
  };
}

// =========================================================================
// SAFE MATH
// =========================================================================

describe("safePercent / safeDivide", () => {
  it("handles division by zero", () => {
    expect(safePercent(10, 0)).toBe(0);
    expect(safeDivide(10, 0)).toBeNull();
  });

  it("computes correct percent", () => {
    expect(safePercent(1, 4)).toBe(25);
  });

  it("computes correct division", () => {
    expect(safeDivide(100, 3)).toBe(33);
  });
});

// =========================================================================
// OVERVIEW
// =========================================================================

describe("computeOverview", () => {
  it("computes KPIs without previous period", () => {
    const result = computeOverview(
      { revenueCents: 100000, incomeReceivedCents: 80000, expensePaidCents: 30000, appointmentsCount: 20, salesCount: 5, newCustomersCount: 3, cancellationsCount: 2, noShowCount: 1 },
      null,
      PERIOD,
      null,
    );
    expect(result.revenueCents).toBe(100000);
    expect(result.netResultCents).toBe(50000);
    expect(result.avgTicketCents).toBe(5000);
    expect(result.prevRevenueCents).toBeNull();
  });

  it("computes comparison with previous period", () => {
    const result = computeOverview(
      { revenueCents: 120000, incomeReceivedCents: 100000, expensePaidCents: 40000, appointmentsCount: 24, salesCount: 6, newCustomersCount: 4, cancellationsCount: 1, noShowCount: 0 },
      { revenueCents: 100000, incomeReceivedCents: 80000, expensePaidCents: 30000, appointmentsCount: 20, salesCount: 5, newCustomersCount: 3, cancellationsCount: 2, noShowCount: 1 },
      PERIOD,
      PREV_PERIOD,
    );
    expect(result.prevRevenueCents).toBe(100000);
    expect(result.prevAppointmentsCount).toBe(20);
  });

  it("handles zero appointments for ticket", () => {
    const result = computeOverview(
      { revenueCents: 0, incomeReceivedCents: 0, expensePaidCents: 0, appointmentsCount: 0, salesCount: 0, newCustomersCount: 0, cancellationsCount: 0, noShowCount: 0 },
      null,
      PERIOD,
      null,
    );
    expect(result.avgTicketCents).toBeNull();
  });
});

// =========================================================================
// SERVICE RANKING
// =========================================================================

describe("computeServiceRanking", () => {
  it("ranks services by revenue", () => {
    const appointments = [
      apt({ service_name_snapshot: "Banho", price_cents_snapshot: 5000 }),
      apt({ id: "a2", service_name_snapshot: "Banho", price_cents_snapshot: 5000 }),
      apt({ id: "a3", service_name_snapshot: "Tosa", price_cents_snapshot: 8000 }),
    ];
    const result = computeServiceRanking(appointments);
    expect(result[0]?.serviceName).toBe("Banho");
    expect(result[0]?.count).toBe(2);
    expect(result[0]?.revenueCents).toBe(10000);
  });

  it("excludes cancelled", () => {
    const appointments = [
      apt({ status: "completed" }),
      apt({ id: "a2", status: "cancelled" }),
    ];
    const result = computeServiceRanking(appointments);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1);
  });

  it("returns empty for no data", () => {
    expect(computeServiceRanking([])).toEqual([]);
  });

  it("calculates percent of total", () => {
    const appointments = [
      apt({ service_name_snapshot: "Banho", price_cents_snapshot: 6000 }),
      apt({ id: "a2", service_name_snapshot: "Tosa", price_cents_snapshot: 4000 }),
    ];
    const result = computeServiceRanking(appointments);
    expect(result[0]?.percentOfTotal).toBe(60);
    expect(result[1]?.percentOfTotal).toBe(40);
  });
});

// =========================================================================
// APPOINTMENTS REPORT
// =========================================================================

describe("computeAppointmentsReport", () => {
  it("counts by status", () => {
    const appointments = [
      apt({ status: "completed" }),
      apt({ id: "a2", status: "cancelled" }),
      apt({ id: "a3", status: "no_show" }),
      apt({ id: "a4", status: "scheduled" }),
    ];
    const result = computeAppointmentsReport(appointments, TZ);
    expect(result.total).toBe(4);
    expect(result.completed).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.noShow).toBe(1);
    expect(result.waiting).toBe(1);
  });

  it("computes avg ticket excluding cancelled/no_show", () => {
    const appointments = [
      apt({ price_cents_snapshot: 6000, status: "completed" }),
      apt({ id: "a2", price_cents_snapshot: 4000, status: "completed" }),
      apt({ id: "a3", price_cents_snapshot: 9999, status: "cancelled" }),
    ];
    const result = computeAppointmentsReport(appointments, TZ);
    expect(result.avgTicketCents).toBe(5000);
  });

  it("handles empty list", () => {
    const result = computeAppointmentsReport([], TZ);
    expect(result.total).toBe(0);
    expect(result.avgTicketCents).toBeNull();
    expect(result.byDay).toEqual([]);
  });

  it("groups by day", () => {
    const appointments = [
      apt({ scheduled_start: "2026-08-15T13:00:00.000Z" }),
      apt({ id: "a2", scheduled_start: "2026-08-15T14:00:00.000Z" }),
      apt({ id: "a3", scheduled_start: "2026-08-16T10:00:00.000Z" }),
    ];
    const result = computeAppointmentsReport(appointments, TZ);
    expect(result.byDay.length).toBeGreaterThanOrEqual(2);
  });
});

// =========================================================================
// CUSTOMER REPORT
// =========================================================================

describe("computeCustomerReport", () => {
  it("counts active and recurring", () => {
    const appointments = [
      apt({ customer_id: "c1" }),
      apt({ id: "a2", customer_id: "c1" }),
      apt({ id: "a3", customer_id: "c2" }),
    ];
    const customers = [
      { id: "c1", name: "Ana", created_at: "2026-08-10T00:00:00.000Z" },
      { id: "c2", name: "Bob", created_at: "2026-08-12T00:00:00.000Z" },
    ];
    const result = computeCustomerReport(appointments, customers, 60);
    expect(result.activeCount).toBe(2);
    expect(result.recurringCount).toBe(1);
  });

  it("handles no appointments", () => {
    const result = computeCustomerReport([], [], 60);
    expect(result.activeCount).toBe(0);
    expect(result.topBySpend).toEqual([]);
  });

  it("top by spend sorts correctly", () => {
    const appointments = [
      apt({ customer_id: "c1", price_cents_snapshot: 10000, status: "completed" }),
      apt({ id: "a2", customer_id: "c2", price_cents_snapshot: 5000, status: "completed" }),
    ];
    const customers = [
      { id: "c1", name: "Rica", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "c2", name: "Pobre", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    const result = computeCustomerReport(appointments, customers, 60);
    expect(result.topBySpend[0]?.name).toBe("Rica");
  });
});

// =========================================================================
// RETENTION
// =========================================================================

describe("computeRetentionReport", () => {
  it("calculates return rate", () => {
    const appointments = [
      apt({ customer_id: "c1" }),
      apt({ id: "a2", customer_id: "c1" }),
      apt({ id: "a3", customer_id: "c2" }),
    ];
    const result = computeRetentionReport(appointments);
    expect(result.totalWithAppointments).toBe(2);
    expect(result.totalReturning).toBe(1);
    expect(result.returnRate).toBe(50);
  });

  it("handles zero customers", () => {
    const result = computeRetentionReport([]);
    expect(result.returnRate).toBe(0);
  });

  it("has clear explanation", () => {
    const result = computeRetentionReport([apt()]);
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// PET REPORT
// =========================================================================

describe("computePetReport", () => {
  it("counts attended pets", () => {
    const appointments = [
      apt({ pet_id: "p1" }),
      apt({ id: "a2", pet_id: "p1" }),
      apt({ id: "a3", pet_id: "p2" }),
    ];
    const pets = [
      { id: "p1", name: "Rex", species: "dog", breed: "Labrador", created_at: "2026-08-01T00:00:00.000Z" },
      { id: "p2", name: "Mia", species: "cat", breed: null, created_at: "2026-08-15T00:00:00.000Z" },
    ];
    const result = computePetReport(appointments, pets);
    expect(result.attendedCount).toBe(2);
    expect(result.bySpecies.length).toBeGreaterThan(0);
  });

  it("handles empty data", () => {
    const result = computePetReport([], []);
    expect(result.attendedCount).toBe(0);
  });
});

// =========================================================================
// EMPLOYEE PERFORMANCE
// =========================================================================

describe("computeEmployeePerformance", () => {
  it("groups by employee", () => {
    const appointments = [
      apt({ employee_id: "e1", price_cents_snapshot: 5000 }),
      apt({ id: "a2", employee_id: "e1", price_cents_snapshot: 3000 }),
      apt({ id: "a3", employee_id: "e2", price_cents_snapshot: 7000 }),
    ];
    const employees = [{ id: "e1", name: "João" }, { id: "e2", name: "Maria" }];
    const result = computeEmployeePerformance(appointments, employees, 30);
    expect(result).toHaveLength(2);
    const joao = result.find((e) => e.employeeName === "João");
    expect(joao?.appointmentsCount).toBe(2);
    expect(joao?.revenueCents).toBe(8000);
  });

  it("handles empty data", () => {
    expect(computeEmployeePerformance([], [], 30)).toEqual([]);
  });
});

// =========================================================================
// OCCUPANCY
// =========================================================================

describe("computeOccupancy", () => {
  it("calculates basic occupancy", () => {
    const appointments = [apt({ employee_id: "e1" })];
    const workingHours = [
      { employee_id: "e1", weekday: 5, enabled: true, start_time: "08:00", end_time: "18:00" },
    ];
    const result = computeOccupancy(appointments, workingHours, 5, TZ);
    expect(result.totalSlotsAvailable).toBeGreaterThan(0);
  });

  it("handles no working hours", () => {
    const result = computeOccupancy([], [], 30, TZ);
    expect(result.overallPercent).toBe(0);
    expect(result.totalSlotsAvailable).toBe(0);
  });
});

// =========================================================================
// CANCELLATIONS
// =========================================================================

describe("computeCancellations", () => {
  it("counts cancellations and no-shows", () => {
    const appointments = [
      apt({ status: "cancelled" }),
      apt({ id: "a2", status: "no_show" }),
      apt({ id: "a3", status: "completed" }),
    ];
    const result = computeCancellations(appointments, TZ);
    expect(result.total).toBe(1);
    expect(result.noShowTotal).toBe(1);
    expect(result.ratePercent).toBeGreaterThan(0);
  });

  it("handles all completed", () => {
    const result = computeCancellations([apt()], TZ);
    expect(result.total).toBe(0);
    expect(result.ratePercent).toBe(0);
  });
});

// =========================================================================
// WEEKDAY / HOUR DISTRIBUTION
// =========================================================================

describe("computeWeekdayDistribution", () => {
  it("returns 7 entries", () => {
    const result = computeWeekdayDistribution([apt()], TZ);
    expect(result).toHaveLength(7);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(1);
  });

  it("labels in Portuguese", () => {
    const result = computeWeekdayDistribution([], TZ);
    expect(result[0]?.label).toBe("Domingo");
    expect(result[1]?.label).toBe("Segunda");
  });
});

describe("computeHourDistribution", () => {
  it("distributes by hour band", () => {
    const result = computeHourDistribution([apt()], TZ);
    expect(result.length).toBeGreaterThan(0);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(1);
  });

  it("empty when no data", () => {
    const result = computeHourDistribution([], TZ);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(0);
  });
});

// =========================================================================
// PDV REPORT
// =========================================================================

describe("computePdvReport", () => {
  it("computes sales metrics", () => {
    const sales = [
      { id: "s1", total_cents: 10000, status: "completed" },
      { id: "s2", total_cents: 5000, status: "completed" },
    ];
    const items = [
      { product_name_snapshot: "Ração", unit_price_cents: 5000, quantity: 2, total_cents: 10000, cost_price_cents_snapshot: 3000 },
      { product_name_snapshot: "Shampoo", unit_price_cents: 5000, quantity: 1, total_cents: 5000, cost_price_cents_snapshot: 2000 },
    ];
    const result = computePdvReport(sales, items);
    expect(result.salesCount).toBe(2);
    expect(result.totalSoldCents).toBe(15000);
    expect(result.avgTicketCents).toBe(7500);
    expect(result.grossProfitCents).toBe(7000);
  });

  it("excludes cancelled sales", () => {
    const sales = [{ id: "s1", total_cents: 10000, status: "cancelled" }];
    const result = computePdvReport(sales, []);
    expect(result.salesCount).toBe(0);
  });

  it("handles empty data", () => {
    const result = computePdvReport([], []);
    expect(result.avgTicketCents).toBeNull();
  });
});

// =========================================================================
// STOCK REPORT
// =========================================================================

describe("computeStockReport", () => {
  it("computes stock value", () => {
    const products = [
      { id: "p1", name: "Ração", current_stock: 10, cost_price_cents: 5000, track_stock: true },
      { id: "p2", name: "Shampoo", current_stock: 0, cost_price_cents: 2000, track_stock: true },
    ];
    const result = computeStockReport(products, [], []);
    expect(result.estimatedValueCents).toBe(50000);
    expect(result.outOfStockCount).toBe(1);
  });

  it("handles non-tracked products", () => {
    const products = [
      { id: "p1", name: "Avulso", current_stock: 999, cost_price_cents: 1000, track_stock: false },
    ];
    const result = computeStockReport(products, [], []);
    expect(result.estimatedValueCents).toBe(0);
  });
});

// =========================================================================
// PACKAGES
// =========================================================================

describe("computePackagesReport", () => {
  it("counts package metrics", () => {
    const packages = [
      { status: "active", price_cents_snapshot: 15000, items: [{ quantity_total: 5, quantity_used: 2 }] },
      { status: "fully_used", price_cents_snapshot: 10000, items: [{ quantity_total: 3, quantity_used: 3 }] },
      { status: "cancelled", price_cents_snapshot: 8000, items: [{ quantity_total: 2, quantity_used: 0 }] },
    ];
    const result = computePackagesReport(packages);
    expect(result.soldCount).toBe(3);
    expect(result.activeCount).toBe(1);
    expect(result.fullyUsedCount).toBe(1);
    expect(result.totalCreditsRemaining).toBe(3);
  });

  it("handles empty", () => {
    const result = computePackagesReport([]);
    expect(result.soldCount).toBe(0);
    expect(result.revenueCents).toBe(0);
  });
});

// =========================================================================
// PERIOD
// =========================================================================

describe("period utilities", () => {
  it("resolves month preset", () => {
    const result = resolveReportPeriod({ preset: "month" }, TZ);
    expect(result.preset).toBe("month");
    expect(result.from).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("resolves year preset", () => {
    const result = resolveReportPeriod({ preset: "year" }, TZ);
    expect(result.preset).toBe("year");
    expect(result.from).toMatch(/-01-01$/);
  });

  it("resolves today preset", () => {
    const result = resolveReportPeriod({ preset: "today" }, TZ);
    expect(result.preset).toBe("today");
    expect(result.from).toBe(result.to);
  });

  it("computes previous period", () => {
    const prev = getPreviousPeriod("2026-08-01", "2026-08-31");
    expect(prev.from).toBe("2026-07-01");
    expect(prev.to).toBe("2026-07-31");
  });

  it("period label in Portuguese", () => {
    expect(periodLabel("month")).toMatch(/mês/i);
    expect(periodLabel("today")).toMatch(/hoje/i);
    expect(periodLabel("year")).toMatch(/ano/i);
  });
});

// =========================================================================
// CSV
// =========================================================================

describe("CSV export", () => {
  it("generates valid CSV", () => {
    const csv = toCsv(["Nome", "Valor"], [["Banho", "R$ 50,00"], ["Tosa", "R$ 80,00"]]);
    expect(csv).toContain("Nome,Valor");
    expect(csv).toContain("Banho");
  });

  it("escapes commas and quotes", () => {
    const csv = toCsv(["Nome"], [['Banho "especial", completo']]);
    expect(csv).toContain('"Banho ""especial"", completo"');
  });

  it("handles empty rows", () => {
    const csv = toCsv(["A", "B"], []);
    expect(csv).toBe("A,B");
  });
});

// =========================================================================
// MULTI-TENANT & PERMISSIONS
// =========================================================================

describe("multi-tenant isolation", () => {
  it("engine is pure, company filtering is in queries layer", () => {
    const overviewA = computeOverview(
      { revenueCents: 5000, incomeReceivedCents: 5000, expensePaidCents: 0, appointmentsCount: 1, salesCount: 0, newCustomersCount: 0, cancellationsCount: 0, noShowCount: 0 },
      null, PERIOD, null,
    );
    const overviewB = computeOverview(
      { revenueCents: 9000, incomeReceivedCents: 9000, expensePaidCents: 0, appointmentsCount: 1, salesCount: 0, newCustomersCount: 0, cancellationsCount: 0, noShowCount: 0 },
      null, PERIOD, null,
    );
    expect(overviewA.revenueCents).toBe(5000);
    expect(overviewB.revenueCents).toBe(9000);
  });
});

// =========================================================================
// MONETARY PRECISION
// =========================================================================

describe("monetary precision", () => {
  it("uses integer cents throughout", () => {
    const overview = computeOverview(
      { revenueCents: 99999, incomeReceivedCents: 88888, expensePaidCents: 33333, appointmentsCount: 3, salesCount: 1, newCustomersCount: 1, cancellationsCount: 0, noShowCount: 0 },
      null, PERIOD, null,
    );
    expect(Number.isInteger(overview.revenueCents)).toBe(true);
    expect(Number.isInteger(overview.netResultCents)).toBe(true);
    expect(Number.isInteger(overview.avgTicketCents!)).toBe(true);
  });
});

// =========================================================================
// EMPTY STATE
// =========================================================================

describe("empty state for all reports", () => {
  it("all reports handle empty data gracefully", () => {
    expect(computeOverview({ revenueCents: 0, incomeReceivedCents: 0, expensePaidCents: 0, appointmentsCount: 0, salesCount: 0, newCustomersCount: 0, cancellationsCount: 0, noShowCount: 0 }, null, PERIOD, null).avgTicketCents).toBeNull();
    expect(computeServiceRanking([])).toEqual([]);
    expect(computeAppointmentsReport([], TZ).total).toBe(0);
    expect(computeCustomerReport([], [], 60).activeCount).toBe(0);
    expect(computeRetentionReport([]).returnRate).toBe(0);
    expect(computePetReport([], []).attendedCount).toBe(0);
    expect(computeEmployeePerformance([], [], 30)).toEqual([]);
    expect(computeOccupancy([], [], 30, TZ).overallPercent).toBe(0);
    expect(computeCancellations([], TZ).total).toBe(0);
    expect(computeWeekdayDistribution([], TZ).reduce((s, d) => s + d.count, 0)).toBe(0);
    expect(computeHourDistribution([], TZ).reduce((s, d) => s + d.count, 0)).toBe(0);
    expect(computePdvReport([], []).salesCount).toBe(0);
    expect(computeStockReport([], [], []).estimatedValueCents).toBe(0);
    expect(computePackagesReport([]).soldCount).toBe(0);
  });
});
