import { describe, expect, it } from "vitest";

import {
  computeAvailableStock,
  getSellableStockAvailability,
  isExpiredDate,
  type StockBatchState,
} from "@/features/inventory/stock-engine";
import { mapPosCatalogProduct, posStockHint, type PosCatalogProductRow } from "@/features/pos/catalog";
import { getPosPeriodBounds, isInstantInPosPeriod } from "@/features/pos/period";
import { validateCartQuantity } from "@/features/pos/cart-engine";
import type { CartLine } from "@/features/pos/types";
import { formatUtcDateInTimezone, localDateTimeToUtcIso } from "@/lib/timezone";

const TODAY = "2026-09-11";

function batch(
  quantityRemaining: number,
  expirationDate: string | null,
): StockBatchState {
  return {
    id: "batch-1",
    batchCode: "L1",
    quantityRemaining,
    expirationDate,
    unitCostCents: 1000,
  };
}

function catalogRow(overrides: Partial<PosCatalogProductRow> = {}): PosCatalogProductRow {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Ração Premium",
    sku: "RAC-01",
    barcode: null,
    category_id: null,
    unit: "kg",
    sale_price_cents: 5000,
    cost_price_cents: 2000,
    current_stock: 10,
    minimum_stock: 2,
    track_stock: true,
    product_categories: { name: "Alimentos" },
    product_batches: [],
    ...overrides,
  };
}

function line(availableStock: number, trackStock = true): CartLine {
  return {
    productId: "product-1",
    name: "Ração Premium",
    unit: "kg",
    unitPriceCents: 3000,
    costPriceCents: 1800,
    quantity: 1,
    availableStock,
    trackStock,
  };
}

describe("BLOCO 6 hardening — disponibilidade vendável do PDV", () => {
  it("1) currentStock 10 / availableStock 10 permanece vendável", () => {
    const availability = getSellableStockAvailability({
      trackStock: true,
      currentStock: 10,
      availableStock: 10,
      minimumStock: 2,
    });
    const product = mapPosCatalogProduct(catalogRow({ current_stock: 10, product_batches: [] }), TODAY);

    expect(availability.canSell).toBe(true);
    expect(availability.reason).toBe("available");
    expect(product.canSell).toBe(true);
    expect(product.availableStock).toBe(10);
    expect(validateCartQuantity(line(10), 1)).toBeNull();
  });

  it("2) currentStock 10 / availableStock 3 continua vendável e sinaliza baixo", () => {
    const batches = [{ quantity_remaining: 7, expiration_date: "2026-09-01" }];
    const product = mapPosCatalogProduct(
      catalogRow({ current_stock: 10, minimum_stock: 5, product_batches: batches }),
      TODAY,
    );
    const availability = getSellableStockAvailability({
      trackStock: true,
      currentStock: 10,
      availableStock: 3,
      minimumStock: 5,
    });

    expect(product.currentStock).toBe(10);
    expect(product.availableStock).toBe(3);
    expect(product.canSell).toBe(true);
    expect(product.availabilityReason).toBe("low");
    expect(availability.status).toBe("low");
    expect(posStockHint("low")).toBe("Estoque disponível baixo");
    expect(validateCartQuantity(line(3), 3)).toBeNull();
    expect(validateCartQuantity(line(3), 4)).toBe("Quantidade acima do estoque disponível.");
  });

  it("3) currentStock 10 / availableStock 0 porque todos os lotes venceram não é vendável", () => {
    const product = mapPosCatalogProduct(
      catalogRow({
        current_stock: 10,
        product_batches: [{ quantity_remaining: 10, expiration_date: "2026-09-10" }],
      }),
      TODAY,
    );

    expect(product.currentStock).toBe(10);
    expect(product.availableStock).toBe(0);
    expect(product.canSell).toBe(false);
    expect(product.availabilityReason).toBe("expired");
    expect(product.stockStatus).toBe("out");
    expect(posStockHint("expired")).toBe("Estoque existente, porém vencido/indisponível");
    expect(validateCartQuantity(line(0), 1)).toBe("Quantidade acima do estoque disponível.");
  });

  it("4) currentStock 0 é sem estoque e não vendável", () => {
    const product = mapPosCatalogProduct(catalogRow({ current_stock: 0, product_batches: [] }), TODAY);

    expect(product.canSell).toBe(false);
    expect(product.availabilityReason).toBe("out");
    expect(product.stockStatus).toBe("out");
    expect(posStockHint("out")).toBe("Sem estoque");
  });

  it("5) produto sem track_stock permanece vendável mesmo com saldo zero", () => {
    const product = mapPosCatalogProduct(
      catalogRow({
        track_stock: false,
        current_stock: 0,
        product_batches: [{ quantity_remaining: 5, expiration_date: "2026-01-01" }],
      }),
      TODAY,
    );

    expect(product.canSell).toBe(true);
    expect(product.availabilityReason).toBe("untracked");
    expect(product.stockStatus).toBe("normal");
    expect(posStockHint("untracked")).toBeNull();
    expect(validateCartQuantity(line(0, false), 2)).toBeNull();
  });

  it("canSell não usa currentStock isoladamente quando há lote vencido", () => {
    const availability = getSellableStockAvailability({
      trackStock: true,
      currentStock: 10,
      availableStock: 0,
    });

    expect(availability.canSell).toBe(false);
    expect(availability.reason).toBe("expired");
  });
});

describe("BLOCO 6 hardening — expiration_date no dia civil da empresa", () => {
  it("6) lote que vence hoje ainda é válido durante o dia civil", () => {
    expect(isExpiredDate("2026-09-11", TODAY)).toBe(false);
    expect(computeAvailableStock(10, [batch(10, "2026-09-11")], TODAY)).toBe(10);

    const product = mapPosCatalogProduct(
      catalogRow({
        product_batches: [{ quantity_remaining: 10, expiration_date: TODAY }],
      }),
      TODAY,
    );
    expect(product.canSell).toBe(true);
    expect(product.availableStock).toBe(10);
  });

  it("7) lote que venceu ontem fica indisponível", () => {
    expect(isExpiredDate("2026-09-10", TODAY)).toBe(true);
    expect(computeAvailableStock(10, [batch(10, "2026-09-10")], TODAY)).toBe(0);
  });

  it("America/Sao_Paulo: virada UTC não antecipa o vencimento civil", () => {
    const civilToday = formatUtcDateInTimezone("2026-09-12T02:00:00.000Z", "America/Sao_Paulo");
    expect(civilToday).toBe("2026-09-11");
    expect(isExpiredDate("2026-09-11", civilToday)).toBe(false);
    expect(isExpiredDate("2026-09-10", civilToday)).toBe(true);
    expect(computeAvailableStock(8, [batch(8, "2026-09-11")], civilToday)).toBe(8);
  });

  it("UTC: meia-noite UTC é o início do dia civil", () => {
    const civilToday = formatUtcDateInTimezone("2026-09-11T00:00:00.000Z", "UTC");
    expect(civilToday).toBe("2026-09-11");
    expect(isExpiredDate("2026-09-11", civilToday)).toBe(false);
    expect(isExpiredDate("2026-09-10", civilToday)).toBe(true);
  });

  it("timezone positivo (Asia/Tokyo) usa o dia civil local, não UTC", () => {
    const instant = "2026-09-10T16:00:00.000Z";
    const tokyo = formatUtcDateInTimezone(instant, "Asia/Tokyo");
    const utc = formatUtcDateInTimezone(instant, "UTC");

    expect(tokyo).toBe("2026-09-11");
    expect(utc).toBe("2026-09-10");
    expect(isExpiredDate("2026-09-10", tokyo)).toBe(true);
    expect(isExpiredDate("2026-09-11", tokyo)).toBe(false);
    expect(isExpiredDate("2026-09-10", utc)).toBe(false);
  });
});

describe("BLOCO 6 hardening — período PDV [start, endExclusive)", () => {
  const timeZone = "America/Sao_Paulo";

  it("23:59:00, 23:59:00.001 e 23:59:59.999 pertencem ao dia; 00:00 do seguinte não", () => {
    const bounds = getPosPeriodBounds("today", timeZone, { today: "2026-09-11" });
    const at2359 = localDateTimeToUtcIso("2026-09-11", "23:59", timeZone);
    const at235900001 = new Date(new Date(at2359).getTime() + 1).toISOString();
    const at235959999 = new Date(new Date(bounds.endExclusive ?? "").getTime() - 1).toISOString();
    const nextMidnight = localDateTimeToUtcIso("2026-09-12", "00:00", timeZone);

    expect(isInstantInPosPeriod(at2359, bounds)).toBe(true);
    expect(isInstantInPosPeriod(at235900001, bounds)).toBe(true);
    expect(isInstantInPosPeriod(at235959999, bounds)).toBe(true);
    expect(isInstantInPosPeriod(nextMidnight, bounds)).toBe(false);
    expect(nextMidnight).toBe(bounds.endExclusive);
  });

  it("filtro hoje/semana/mês/custom usa o fuso da empresa", () => {
    const today = getPosPeriodBounds("today", timeZone, { today: "2026-09-11" });
    expect(today.start).toBe(localDateTimeToUtcIso("2026-09-11", "00:00", timeZone));
    expect(today.endExclusive).toBe(localDateTimeToUtcIso("2026-09-12", "00:00", timeZone));

    const week = getPosPeriodBounds("week", timeZone, { today: "2026-09-11" });
    expect(week.start).toBe(localDateTimeToUtcIso("2026-09-06", "00:00", timeZone));
    expect(week.endExclusive).toBe(localDateTimeToUtcIso("2026-09-13", "00:00", timeZone));

    const month = getPosPeriodBounds("month", timeZone, { today: "2026-09-11" });
    expect(month.start).toBe(localDateTimeToUtcIso("2026-09-01", "00:00", timeZone));
    expect(month.endExclusive).toBe(localDateTimeToUtcIso("2026-10-01", "00:00", timeZone));

    const custom = getPosPeriodBounds("custom", timeZone, {
      from: "2026-09-01",
      to: "2026-09-11",
    });
    expect(custom.start).toBe(localDateTimeToUtcIso("2026-09-01", "00:00", timeZone));
    expect(custom.endExclusive).toBe(localDateTimeToUtcIso("2026-09-12", "00:00", timeZone));
    expect(isInstantInPosPeriod(localDateTimeToUtcIso("2026-09-11", "23:59", timeZone), custom)).toBe(
      true,
    );
    expect(isInstantInPosPeriod(localDateTimeToUtcIso("2026-09-12", "00:00", timeZone), custom)).toBe(
      false,
    );
  });

  it("virada de mês e de ano no fuso da empresa", () => {
    const month = getPosPeriodBounds("month", "UTC", { today: "2026-01-31" });
    expect(month.endExclusive).toBe("2026-02-01T00:00:00.000Z");
    expect(isInstantInPosPeriod("2026-02-01T00:00:00.000Z", month)).toBe(false);

    const year = getPosPeriodBounds("today", "UTC", { today: "2026-12-31" });
    expect(year.endExclusive).toBe("2027-01-01T00:00:00.000Z");
    expect(isInstantInPosPeriod("2027-01-01T00:00:00.000Z", year)).toBe(false);
    expect(isInstantInPosPeriod("2026-12-31T23:59:59.999Z", year)).toBe(true);
  });

  it("UTC e timezone positivo (Asia/Tokyo)", () => {
    const utc = getPosPeriodBounds("today", "UTC", { today: "2026-09-11" });
    expect(utc.start).toBe("2026-09-11T00:00:00.000Z");
    expect(utc.endExclusive).toBe("2026-09-12T00:00:00.000Z");

    const tokyo = getPosPeriodBounds("today", "Asia/Tokyo", { today: "2026-09-11" });
    expect(tokyo.start).toBe(localDateTimeToUtcIso("2026-09-11", "00:00", "Asia/Tokyo"));
    expect(tokyo.endExclusive).toBe(localDateTimeToUtcIso("2026-09-12", "00:00", "Asia/Tokyo"));
    expect(isInstantInPosPeriod(tokyo.endExclusive ?? "", tokyo)).toBe(false);
  });
});
