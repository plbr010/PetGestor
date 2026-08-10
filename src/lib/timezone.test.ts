import { describe, expect, it } from "vitest";

import {
  addDaysToDateString,
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  getTodayInTimezone,
  getWeekDates,
  getWeekdayInTimezone,
  isPastLocalDate,
  isPastLocalDateTime,
  localDateTimeToUtcIso,
} from "@/lib/timezone";

describe("localDateTimeToUtcIso", () => {
  it("converte horário local para UTC", () => {
    const iso = localDateTimeToUtcIso("2026-08-10", "10:00", "America/Sao_Paulo");
    expect(iso.endsWith("Z")).toBe(true);
    expect(formatUtcInTimezone(iso, "America/Sao_Paulo")).toBe("10:00");
  });
});

describe("formatUtcDateInTimezone", () => {
  it("formata data local corretamente", () => {
    const iso = localDateTimeToUtcIso("2026-08-10", "10:00", "America/Sao_Paulo");
    expect(formatUtcDateInTimezone(iso, "America/Sao_Paulo")).toBe("2026-08-10");
  });
});

describe("getWeekdayInTimezone", () => {
  it("retorna weekday entre 0 e 6", () => {
    const iso = localDateTimeToUtcIso("2026-08-10", "12:00", "America/Sao_Paulo");
    const weekday = getWeekdayInTimezone(iso, "America/Sao_Paulo");
    expect(weekday).toBeGreaterThanOrEqual(0);
    expect(weekday).toBeLessThanOrEqual(6);
  });
});

describe("getWeekDates", () => {
  it("retorna 7 datas", () => {
    expect(getWeekDates("2026-08-10")).toHaveLength(7);
  });
});

describe("addDaysToDateString", () => {
  it("avança dias", () => {
    expect(addDaysToDateString("2026-08-10", 1)).toBe("2026-08-11");
  });
});

describe("isPastLocalDate", () => {
  it("identifica data passada", () => {
    expect(isPastLocalDate("2000-01-01", "America/Sao_Paulo")).toBe(true);
  });
});

describe("isPastLocalDateTime", () => {
  it("identifica horário passado", () => {
    expect(isPastLocalDateTime("2000-01-01", "08:00", "America/Sao_Paulo")).toBe(true);
  });
});

describe("getTodayInTimezone", () => {
  it("retorna YYYY-MM-DD", () => {
    expect(getTodayInTimezone("America/Sao_Paulo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
