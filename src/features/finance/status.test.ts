import { describe, expect, it } from "vitest";

import {
  canCancelFinancialEntry,
  canReopenFinancialEntry,
  canTransitionFinancialStatus,
  isManualEntryEditable,
  parseFinancialEntryStatusFilter,
  parseFinancialEntryTypeFilter,
  parsePaymentMethodFilter,
} from "@/features/finance/status";

describe("canTransitionFinancialStatus", () => {
  it("permite pending → paid", () => {
    expect(canTransitionFinancialStatus("pending", "paid")).toBe(true);
  });

  it("permite pending → cancelled", () => {
    expect(canTransitionFinancialStatus("pending", "cancelled")).toBe(true);
  });

  it("permite paid → pending (reabertura)", () => {
    expect(canTransitionFinancialStatus("paid", "pending")).toBe(true);
  });

  it("permite partially_paid → pending (reabertura manual)", () => {
    expect(canTransitionFinancialStatus("partially_paid", "pending")).toBe(true);
  });

  it("não permite cancelar partially_paid pela máquina de status da UI", () => {
    expect(canTransitionFinancialStatus("partially_paid", "cancelled")).toBe(false);
  });

  it("bloqueia cancelled → paid", () => {
    expect(canTransitionFinancialStatus("cancelled", "paid")).toBe(false);
  });
});

describe("isManualEntryEditable", () => {
  it("permite manual", () => {
    expect(isManualEntryEditable("manual")).toBe(true);
  });

  it("bloqueia service_order", () => {
    expect(isManualEntryEditable("service_order")).toBe(false);
  });
});

describe("reabertura e cancelamento na UI", () => {
  it("só reabre manual paid/partial", () => {
    expect(canReopenFinancialEntry("manual", "paid")).toBe(true);
    expect(canReopenFinancialEntry("manual", "partially_paid")).toBe(true);
    expect(canReopenFinancialEntry("service_order", "paid")).toBe(false);
    expect(canReopenFinancialEntry("sale", "paid")).toBe(false);
  });

  it("só cancela manual pending", () => {
    expect(canCancelFinancialEntry("manual", "pending")).toBe(true);
    expect(canCancelFinancialEntry("manual", "paid")).toBe(false);
    expect(canCancelFinancialEntry("manual", "partially_paid")).toBe(false);
  });
});

describe("filtros de URL", () => {
  it("parseia tipo", () => {
    expect(parseFinancialEntryTypeFilter("income")).toBe("income");
    expect(parseFinancialEntryTypeFilter("invalid")).toBe("all");
  });

  it("parseia status", () => {
    expect(parseFinancialEntryStatusFilter("pending")).toBe("pending");
    expect(parseFinancialEntryStatusFilter("x")).toBe("all");
  });

  it("parseia forma de pagamento", () => {
    expect(parsePaymentMethodFilter("pix")).toBe("pix");
    expect(parsePaymentMethodFilter("x")).toBe("all");
  });
});
