import { describe, expect, it } from "vitest";

import {
  formatServicesSummary,
  formatWorkingHourRange,
  getDefaultWorkingHours,
  parseSchedulableFilter,
  parseStatusFilter,
  parseTimeInput,
} from "@/features/employees/utils";

describe("employee utils", () => {
  it("parseStatusFilter normaliza valores", () => {
    expect(parseStatusFilter("active")).toBe("active");
    expect(parseStatusFilter("invalid")).toBe("all");
  });

  it("parseSchedulableFilter normaliza valores", () => {
    expect(parseSchedulableFilter("yes")).toBe("yes");
    expect(parseSchedulableFilter("invalid")).toBe("all");
  });

  it("parseTimeInput valida HH:mm", () => {
    expect(parseTimeInput("08:00")).toBe("08:00");
    expect(parseTimeInput("25:00")).toBeNull();
  });

  it("formatWorkingHourRange cobre folga e intervalo", () => {
    expect(formatWorkingHourRange(false, null, null)).toBe("Folga");
    expect(formatWorkingHourRange(true, "08:00:00", "18:00:00")).toBe("08:00–18:00");
  });

  it("formatServicesSummary resume serviços", () => {
    expect(
      formatServicesSummary([
        { serviceName: "Banho" },
        { serviceName: "Tosa" },
        { serviceName: "Hidratação" },
      ]),
    ).toBe("Banho, Tosa +1");
  });

  it("getDefaultWorkingHours define semana padrão", () => {
    const defaults = getDefaultWorkingHours();
    expect(defaults).toHaveLength(7);
    expect(defaults.find((day) => day.weekday === 0)?.enabled).toBe(false);
    expect(defaults.find((day) => day.weekday === 1)?.enabled).toBe(true);
  });
});
