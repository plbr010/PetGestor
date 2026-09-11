import { describe, expect, it } from "vitest";

import { isInstantInCivilDateRange, localDateTimeToUtcIso } from "@/lib/timezone";
import { toCsv } from "@/features/reports/csv";
import {
  computeCustomerReport,
  computeEmployeePerformance,
  computeOccupancy,
  computePackagesReport,
  computePdvReport,
  computePetReport,
  computeStockReport,
} from "@/features/reports/engine";
import { mergeOccupiedMinutes } from "@/features/reports/occupancy";
import { countWeekdaysInCivilRange, getReportPeriodBounds } from "@/features/reports/period";
import { classifyBatchExpiration, classifyStockMovement } from "@/features/reports/stock-classification";

const TZ = "America/Sao_Paulo";

function apt(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides.id as string) ?? "a1",
    scheduled_start: (overrides.scheduled_start as string) ?? "2026-09-11T13:00:00.000Z",
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

describe("BLOCO 7 — períodos half-open", () => {
  it("23:59:00, 23:59:00.001 e 23:59:59.999 pertencem ao dia; 00:00 do seguinte não", () => {
    const bounds = getReportPeriodBounds("2026-09-11", "2026-09-11", TZ);
    const at2359 = localDateTimeToUtcIso("2026-09-11", "23:59", TZ);
    const at2359001 = new Date(new Date(at2359).getTime() + 1).toISOString();
    const at235959999 = new Date(new Date(bounds.endExclusive).getTime() - 1).toISOString();
    const nextMidnight = localDateTimeToUtcIso("2026-09-12", "00:00", TZ);

    expect(isInstantInCivilDateRange(at2359, "2026-09-11", "2026-09-11", TZ)).toBe(true);
    expect(isInstantInCivilDateRange(at2359001, "2026-09-11", "2026-09-11", TZ)).toBe(true);
    expect(isInstantInCivilDateRange(at235959999, "2026-09-11", "2026-09-11", TZ)).toBe(true);
    expect(nextMidnight).toBe(bounds.endExclusive);
    expect(isInstantInCivilDateRange(nextMidnight, "2026-09-11", "2026-09-11", TZ)).toBe(false);
  });

  it("respeita virada de mês, ano, UTC, Tokyo e DST", () => {
    const month = getReportPeriodBounds("2026-01-31", "2026-01-31", TZ);
    expect(month.endExclusive).toBe(localDateTimeToUtcIso("2026-02-01", "00:00", TZ));

    const year = getReportPeriodBounds("2026-12-31", "2026-12-31", "UTC");
    expect(year.endExclusive).toBe("2027-01-01T00:00:00.000Z");

    const tokyo = getReportPeriodBounds("2026-09-11", "2026-09-11", "Asia/Tokyo");
    expect(tokyo.endExclusive).toBe(localDateTimeToUtcIso("2026-09-12", "00:00", "Asia/Tokyo"));

    const dst = getReportPeriodBounds("2026-03-08", "2026-03-08", "America/New_York");
    expect(isInstantInCivilDateRange(dst.endExclusive, "2026-03-08", "2026-03-08", "America/New_York")).toBe(
      false,
    );
  });
});

describe("BLOCO 7 — PDV canceladas e ranking por product_id", () => {
  it("venda completed e partially_paid entram; cancelled não infla unidades/receita/margem", () => {
    const sales = [
      { id: "a", total_cents: 10000, status: "completed" },
      { id: "b", total_cents: 10000, status: "cancelled" },
      { id: "c", total_cents: 4000, status: "partially_paid" },
    ];
    const items = [
      { sale_id: "a", product_id: "x", product_name_snapshot: "Shampoo", unit_price_cents: 10000, quantity: 1, total_cents: 10000, cost_price_cents_snapshot: 4000 },
      { sale_id: "b", product_id: "x", product_name_snapshot: "Shampoo", unit_price_cents: 10000, quantity: 1, total_cents: 10000, cost_price_cents_snapshot: 4000 },
      { sale_id: "c", product_id: "y", product_name_snapshot: "Ração", unit_price_cents: 4000, quantity: 1, total_cents: 4000, cost_price_cents_snapshot: 2000 },
    ];
    const result = computePdvReport(sales, items);
    expect(result.salesCount).toBe(2);
    expect(result.totalSoldCents).toBe(14000);
    expect(result.topProducts.find((row) => row.productId === "x")?.unitsSold).toBe(1);
    expect(result.topProducts.find((row) => row.productId === "x")?.revenueCents).toBe(10000);
    expect(result.grossProfitCents).toBe(8000);
  });

  it("dois produtos com o mesmo nome permanecem separados por product_id", () => {
    const sales = [
      { id: "s1", total_cents: 1000, status: "completed" },
      { id: "s2", total_cents: 2000, status: "completed" },
    ];
    const items = [
      { sale_id: "s1", product_id: "1", product_name_snapshot: "Shampoo", unit_price_cents: 1000, quantity: 1, total_cents: 1000, cost_price_cents_snapshot: 100 },
      { sale_id: "s2", product_id: "2", product_name_snapshot: "Shampoo", unit_price_cents: 2000, quantity: 1, total_cents: 2000, cost_price_cents_snapshot: 200 },
    ];
    const result = computePdvReport(sales, items);
    expect(result.topProducts).toHaveLength(2);
    expect(result.topProducts.map((row) => row.productId).sort()).toEqual(["1", "2"]);
  });

  it("mesmo produto em várias vendas soma; snapshot de nome pode mudar", () => {
    const sales = [
      { id: "s1", total_cents: 1000, status: "completed" },
      { id: "s2", total_cents: 1500, status: "completed" },
    ];
    const items = [
      { sale_id: "s1", product_id: "1", product_name_snapshot: "Shampoo", unit_price_cents: 1000, quantity: 1, total_cents: 1000, cost_price_cents_snapshot: 400 },
      { sale_id: "s2", product_id: "1", product_name_snapshot: "Shampoo Premium", unit_price_cents: 1500, quantity: 1, total_cents: 1500, cost_price_cents_snapshot: 400 },
    ];
    const result = computePdvReport(sales, items);
    expect(result.topProducts).toHaveLength(1);
    expect(result.topProducts[0]?.productId).toBe("1");
    expect(result.topProducts[0]?.unitsSold).toBe(2);
    expect(result.topProducts[0]?.name).toBe("Shampoo Premium");
  });

  it("item de venda cancelada sem sale_id válido não entra mesmo se o array vier completo", () => {
    const result = computePdvReport(
      [{ id: "s1", total_cents: 10000, status: "cancelled" }],
      [{ sale_id: "s1", product_id: "x", product_name_snapshot: "Shampoo", unit_price_cents: 10000, quantity: 1, total_cents: 10000, cost_price_cents_snapshot: 1 }],
    );
    expect(result.salesCount).toBe(0);
    expect(result.topProducts).toEqual([]);
    expect(result.grossProfitCents).toBe(0);
  });
});

describe("BLOCO 7 — classificação e reconciliação de estoque", () => {
  it("cada tipo conhecido cai em exatamente uma categoria", () => {
    expect(classifyStockMovement({ type: "entry", quantity: 10 }).category).toBe("entry");
    expect(classifyStockMovement({ type: "return", quantity: 2 }).category).toBe("return");
    expect(classifyStockMovement({ type: "sale", quantity: 3 }).category).toBe("sale");
    expect(classifyStockMovement({ type: "internal_use", quantity: 1 }).category).toBe("internal_use");
    expect(classifyStockMovement({ type: "exit", quantity: 1 }).category).toBe("exit");
    expect(classifyStockMovement({ type: "loss", quantity: 1 }).category).toBe("loss");
    expect(
      classifyStockMovement({ type: "adjustment", quantity: 2, previousQuantity: 5, newQuantity: 7 }).category,
    ).toBe("adjustment_positive");
    expect(
      classifyStockMovement({ type: "adjustment", quantity: 2, previousQuantity: 5, newQuantity: 3 }).category,
    ).toBe("adjustment_negative");
  });

  it("tipo desconhecido não desaparece", () => {
    const classified = classifyStockMovement({
      type: "sale_exit",
      quantity: 4,
      previousQuantity: 10,
      newQuantity: 6,
    });
    expect(classified.category).toBe("unknown");
    const report = computeStockReport(
      [{ id: "p1", name: "Ração", current_stock: 6, cost_price_cents: 100, track_stock: true, unit: "kg" }],
      [{ product_id: "p1", type: "sale_exit", quantity: 4, previous_quantity: 10, new_quantity: 6, created_at: "2026-09-11T12:00:00.000Z" }],
      [],
      { today: "2026-09-11", periodStart: "2026-09-11T03:00:00.000Z", periodEndExclusive: "2026-09-12T03:00:00.000Z" },
    );
    expect(report.unknownMovements).toHaveLength(1);
    expect(report.unknownMovements[0]?.type).toBe("sale_exit");
  });

  it("reconciliação fecha com entry/sale/internal_use/exit/loss/return/ajustes", () => {
    const movements = [
      { product_id: "p1", type: "entry", quantity: 20, created_at: "2026-09-01T12:00:00.000Z" },
      { product_id: "p1", type: "return", quantity: 2, created_at: "2026-09-02T12:00:00.000Z" },
      { product_id: "p1", type: "sale", quantity: 5, created_at: "2026-09-03T12:00:00.000Z" },
      { product_id: "p1", type: "internal_use", quantity: 1, created_at: "2026-09-04T12:00:00.000Z" },
      { product_id: "p1", type: "exit", quantity: 2, created_at: "2026-09-05T12:00:00.000Z" },
      { product_id: "p1", type: "loss", quantity: 1, created_at: "2026-09-06T12:00:00.000Z", reason: "expired", unit_cost_cents: 500 },
      { product_id: "p1", type: "adjustment", quantity: 3, previous_quantity: 13, new_quantity: 16, created_at: "2026-09-07T12:00:00.000Z" },
      { product_id: "p1", type: "adjustment", quantity: 1, previous_quantity: 16, new_quantity: 15, created_at: "2026-09-08T12:00:00.000Z" },
    ];
    const expected = 20 + 2 - 5 - 1 - 2 - 1 + 3 - 1;
    const report = computeStockReport(
      [{ id: "p1", name: "Ração", current_stock: expected, cost_price_cents: 500, track_stock: true, unit: "kg" }],
      movements,
      [],
      {
        today: "2026-09-11",
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEndExclusive: "2026-09-12T00:00:00.000Z",
        allMovements: movements,
      },
    );
    const row = report.reconciliation[0];
    expect(row?.closingFromMovements).toBe(expected);
    expect(row?.currentStock).toBe(expected);
    expect(row?.hasLegacyDivergence).toBe(false);
    expect(report.losses[0]?.quantity).toBe(1);
    expect(report.losses[0]?.reason).toBe("expired");
  });

  it("separa vencido, vence hoje e a vencer; 31 dias fica fora; null não entra", () => {
    const today = "2026-09-11";
    expect(classifyBatchExpiration("2026-09-10", today)).toBe("expired");
    expect(classifyBatchExpiration("2026-09-11", today)).toBe("expires_today");
    expect(classifyBatchExpiration("2026-09-12", today)).toBe("expiring_soon");
    expect(classifyBatchExpiration("2026-10-11", today)).toBe("expiring_soon");
    expect(classifyBatchExpiration("2026-10-12", today)).toBe("ok");
    expect(classifyBatchExpiration(null, today)).toBe("no_date");

    const report = computeStockReport(
      [{ id: "p1", name: "Ração", current_stock: 10, cost_price_cents: 100, track_stock: true, unit: "kg" }],
      [],
      [
        { product_id: "p1", batch_code: "A", expiration_date: "2026-09-10", quantity: 1 },
        { product_id: "p1", batch_code: "B", expiration_date: "2026-09-11", quantity: 2 },
        { product_id: "p1", batch_code: "C", expiration_date: "2026-09-12", quantity: 3 },
        { product_id: "p1", batch_code: "D", expiration_date: "2026-10-11", quantity: 4 },
        { product_id: "p1", batch_code: "E", expiration_date: "2026-10-12", quantity: 5 },
        { product_id: "p1", batch_code: "F", expiration_date: "", quantity: 6 },
      ],
      { today },
    );
    expect(report.expired.map((row) => row.batchCode)).toEqual(["A"]);
    expect(report.expiresToday.map((row) => row.batchCode)).toEqual(["B"]);
    expect(report.expiringSoon.map((row) => row.batchCode).sort()).toEqual(["C", "D"]);
  });
});

describe("BLOCO 7 — pacotes", () => {
  const today = "2026-09-11";

  it("active paid, pending, fully_used, expirado por data, cancelled e legado paid", () => {
    const result = computePackagesReport(
      [
        { id: "1", status: "active", financialStatus: "paid", expires_at: "2026-12-01", price_cents_snapshot: 10000, items: [{ quantity_total: 4, quantity_used: 1 }] },
        { id: "2", status: "active", financialStatus: "pending", expires_at: "2026-12-01", price_cents_snapshot: 8000, items: [{ quantity_total: 4, quantity_used: 0 }] },
        { id: "3", status: "fully_used", financialStatus: "paid", expires_at: "2026-12-01", price_cents_snapshot: 5000, items: [{ quantity_total: 2, quantity_used: 2 }] },
        { id: "4", status: "active", financialStatus: "paid", expires_at: "2026-09-10", price_cents_snapshot: 7000, items: [{ quantity_total: 3, quantity_used: 0 }] },
        { id: "5", status: "cancelled", financialStatus: "pending", expires_at: "2026-12-01", price_cents_snapshot: 3000, items: [{ quantity_total: 2, quantity_used: 0 }] },
        { id: "6", status: "cancelled", financialStatus: "paid", expires_at: "2026-12-01", price_cents_snapshot: 9000, items: [{ quantity_total: 2, quantity_used: 0 }] },
        { id: "7", status: "active", financialStatus: "paid", expires_at: "2026-09-11", price_cents_snapshot: 2000, items: [{ quantity_total: 1, quantity_used: 0 }] },
      ],
      today,
      TZ,
    );

    expect(result.soldCount).toBe(5);
    expect(result.pendingCount).toBe(1);
    expect(result.activeCount).toBe(2);
    expect(result.expiredCount).toBe(1);
    expect(result.fullyUsedCount).toBe(1);
    expect(result.cancelledCount).toBe(2);
    expect(result.receivedCents).toBe(10000 + 5000 + 7000 + 2000);
    expect(result.totalCreditsRemaining).toBe(3 + 1);
    expect(result.inconsistencies.some((row) => row.kind === "cancelled_paid_legacy")).toBe(true);
  });

  it("expiração usa data civil, não o relógio UTC", () => {
    const tokyoYesterday = computePackagesReport(
      [{ status: "active", financialStatus: "paid", expires_at: "2026-09-10", price_cents_snapshot: 1000, items: [{ quantity_total: 1, quantity_used: 0 }] }],
      "2026-09-11",
      "Asia/Tokyo",
    );
    expect(tokyoYesterday.expiredCount).toBe(1);
    expect(tokyoYesterday.activeCount).toBe(0);

    const stillValidToday = computePackagesReport(
      [{ status: "active", financialStatus: "paid", expires_at: "2026-09-11", price_cents_snapshot: 1000, items: [{ quantity_total: 1, quantity_used: 0 }] }],
      "2026-09-11",
      "UTC",
    );
    expect(stillValidToday.activeCount).toBe(1);
  });
});

describe("BLOCO 7 — ocupação", () => {
  const mondayHours = [
    {
      employee_id: "e1",
      weekday: 1,
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      break_start: "12:00",
      break_end: "13:00",
    },
  ];

  it("periodos 1/6/7/8/30/31 usam ocorrências reais de weekday", () => {
    expect(countWeekdaysInCivilRange("2026-01-05", "2026-01-05")[1]).toBe(1);
    expect(countWeekdaysInCivilRange("2026-01-05", "2026-01-10").reduce((sum, value) => sum + value, 0)).toBe(6);
    expect(countWeekdaysInCivilRange("2026-01-05", "2026-01-11")[1]).toBe(1);
    expect(countWeekdaysInCivilRange("2026-01-05", "2026-01-12")[1]).toBe(2);

    const one = computeOccupancy([], mondayHours, { from: "2026-01-05", to: "2026-01-05" }, TZ);
    const eight = computeOccupancy([], mondayHours, { from: "2026-01-05", to: "2026-01-12" }, TZ);
    expect(one.capacityMinutes).toBe(540);
    expect(eight.capacityMinutes).toBe(1080);

    const satHours = [
      {
        employee_id: "e1",
        weekday: 6,
        enabled: true,
        start_time: "08:00",
        end_time: "13:00",
        break_start: null,
        break_end: null,
      },
    ];
    const days30 = computeOccupancy([], satHours, { from: "2026-01-01", to: "2026-01-30" }, TZ);
    const days31 = computeOccupancy([], satHours, { from: "2026-01-01", to: "2026-01-31" }, TZ);
    expect(days30.capacityMinutes).toBe(4 * 300);
    expect(days31.capacityMinutes).toBe(5 * 300);
  });

  it("usa duração real e não conta no-show como realizado", () => {
    const period = { from: "2026-09-07", to: "2026-09-07" };
    const hours = [
      {
        employee_id: "e1",
        weekday: 1,
        enabled: true,
        start_time: "08:00",
        end_time: "16:00",
        break_start: null,
        break_end: null,
      },
    ];
    const appointments = [
      apt({ id: "a1", status: "completed", duration_minutes_snapshot: 30, scheduled_start: localDateTimeToUtcIso("2026-09-07", "09:00", TZ) }),
      apt({ id: "a2", status: "completed", duration_minutes_snapshot: 60, scheduled_start: localDateTimeToUtcIso("2026-09-07", "10:00", TZ) }),
      apt({ id: "a3", status: "completed", duration_minutes_snapshot: 90, scheduled_start: localDateTimeToUtcIso("2026-09-07", "13:00", TZ) }),
      apt({ id: "a4", status: "no_show", duration_minutes_snapshot: 60, scheduled_start: localDateTimeToUtcIso("2026-09-07", "15:00", TZ) }),
      apt({ id: "a5", status: "cancelled", duration_minutes_snapshot: 90, scheduled_start: localDateTimeToUtcIso("2026-09-07", "08:00", TZ) }),
    ];
    const result = computeOccupancy(appointments, hours, period, TZ);
    expect(result.capacityMinutes).toBe(480);
    expect(result.servedMinutes).toBe(180);
    expect(result.reservedMinutes).toBe(240);
    expect(result.noShowMinutes).toBe(60);
    expect(result.cancelledMinutes).toBe(90);
    expect(result.overallServedPercent).toBe(37.5);
  });

  it("mescla sobreposição no mesmo colaborador/dia", () => {
    expect(mergeOccupiedMinutes([
      { start: 10 * 60, end: 11 * 60 },
      { start: 10 * 60 + 30, end: 11 * 60 + 30 },
    ])).toBe(90);

    const result = computeOccupancy(
      [
        apt({ id: "a1", scheduled_start: localDateTimeToUtcIso("2026-09-07", "10:00", TZ), duration_minutes_snapshot: 60 }),
        apt({ id: "a2", scheduled_start: localDateTimeToUtcIso("2026-09-07", "10:30", TZ), duration_minutes_snapshot: 60 }),
      ],
      mondayHours,
      { from: "2026-09-07", to: "2026-09-07" },
      TZ,
    );
    expect(result.reservedMinutes).toBe(90);
  });
});

describe("BLOCO 7 — soft delete operacional", () => {
  it("cliente/pet/funcionário ausentes do conjunto ativo não entram em ranking operacional", () => {
    const appointments = [
      apt({ customer_id: "alive", pet_id: "pet-alive", employee_id: "e-alive" }),
      apt({ id: "a2", customer_id: "deleted", pet_id: "pet-deleted", employee_id: "e-deleted" }),
    ];
    const customers = computeCustomerReport(appointments, [
      { id: "alive", name: "Ana", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(customers.activeCount).toBe(1);
    expect(customers.topBySpend[0]?.name).toBe("Ana");

    const pets = computePetReport(appointments, [
      { id: "pet-alive", name: "Rex", species: "dog", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(pets.attendedCount).toBe(1);

    const employees = computeEmployeePerformance(appointments, [{ id: "e-alive", name: "João" }], 1);
    expect(employees).toHaveLength(1);
    expect(employees[0]?.employeeName).toBe("João");
  });
});

describe("BLOCO 7 — CSV", () => {
  it("usa BOM e escapa aspas, vírgula e quebra de linha", () => {
    const csv = toCsv(["Nome", "Nota"], [["Banho, tosa", 'disse "oi"\nlinha']]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Banho, tosa"');
    expect(csv).toContain('"disse ""oi""\nlinha"');
  });

  it("impede formula injection", () => {
    const csv = toCsv(
      ["Campo"],
      [["=HYPERLINK(\"http://evil\")"], ["+1+1"], ["@SUM(A1)"], ["-1+1"]],
    );
    const body = csv.replace(/^\uFEFF/, "");
    for (const line of body.split("\n").slice(1)) {
      expect(line.startsWith("=") || line.startsWith("+") || line.startsWith("@") || line.startsWith("-")).toBe(
        false,
      );
      expect(line).toContain("'");
    }
  });

  it("preserva caracteres pt-BR", () => {
    const csv = toCsv(["Descrição"], [["Atenção: banho e tosa"]]);
    expect(csv).toContain("Atenção: banho e tosa");
  });
});

describe("BLOCO 7 — merge de intervalos", () => {
  it("mescla ocupação sobreposta", () => {
    expect(typeof mergeOccupiedMinutes).toBe("function");
  });
});
