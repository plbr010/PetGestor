import { describe, expect, it } from "vitest";

import {
  formatServiceDurationSummary,
  formatServicePriceSummary,
  parseStatusFilter,
} from "@/features/services/utils";

describe("parseStatusFilter", () => {
  it("normaliza filtros", () => {
    expect(parseStatusFilter("active")).toBe("active");
    expect(parseStatusFilter("inactive")).toBe("inactive");
    expect(parseStatusFilter("all")).toBe("all");
    expect(parseStatusFilter(undefined)).toBe("all");
    expect(parseStatusFilter("invalid")).toBe("all");
  });
});

describe("display summaries", () => {
  it("formata preço fixed", () => {
    expect(formatServicePriceSummary("fixed", 4500, [])).toBe("R$ 45,00");
  });

  it("formata preço by_size como mínimo", () => {
    expect(
      formatServicePriceSummary("by_size", null, [
        { price_cents: 8000 },
        { price_cents: 4500 },
      ]),
    ).toBe("A partir de R$ 45,00");
  });

  it("formata duração by_size como intervalo", () => {
    expect(
      formatServiceDurationSummary("by_size", 30, [
        { duration_minutes: 30 },
        { duration_minutes: 90 },
      ]),
    ).toBe("30–90 min");
  });
});
