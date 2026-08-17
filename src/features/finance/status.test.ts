import { describe, expect, it } from "vitest";

import {
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

  it("permite pending → partially_paid", () => {
    expect(canTransitionFinancialStatus("pending", "partially_paid")).toBe(true);
  });

  it("permite partially_paid → paid", () => {
    expect(canTransitionFinancialStatus("partially_paid", "paid")).toBe(true);
  });

  it("permite paid → pending (reabertura)", () => {
    expect(canTransitionFinancialStatus("paid", "pending")).toBe(true);
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

describe("filtros de URL", () => {
  it("parseia tipo", () => {
    expect(parseFinancialEntryTypeFilter("income")).toBe("income");
    expect(parseFinancialEntryTypeFilter("invalid")).toBe("all");
  });

  it("parseia status partially_paid", () => {
    expect(parseFinancialEntryStatusFilter("partially_paid")).toBe("partially_paid");
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
