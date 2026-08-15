import { describe, expect, it } from "vitest";

import {
  addMonthsToDateString,
  expandRecurrenceStarts,
  formatRecurrenceSkipSummary,
  RECURRENCE_MAX_OCCURRENCES,
  stepRecurrenceLocalDate,
} from "@/features/appointments/recurrence";

describe("recurrence date helpers", () => {
  it("soma meses com clamp (31 jan → 28/29 fev)", () => {
    expect(addMonthsToDateString("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDateString("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("avança semanal, quinzenal, mensal e custom_days", () => {
    expect(stepRecurrenceLocalDate("2026-08-15", "weekly", 1)).toBe("2026-08-22");
    expect(stepRecurrenceLocalDate("2026-08-15", "biweekly", 1)).toBe("2026-08-29");
    expect(stepRecurrenceLocalDate("2026-08-15", "monthly", 1)).toBe("2026-09-15");
    expect(stepRecurrenceLocalDate("2026-08-15", "custom_days", 3)).toBe("2026-08-18");
  });
});

describe("expandRecurrenceStarts", () => {
  const start = "2026-08-15T12:00:00.000Z"; // 09:00 America/Sao_Paulo (UTC-3)
  const tz = "America/Sao_Paulo";

  it("gera semanal por quantidade", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "weekly",
      intervalValue: 1,
      maxOccurrences: 4,
      endsAtLocalDate: null,
    });

    expect(starts).toHaveLength(4);
    expect(starts[0]).toBe(start);
  });

  it("gera quinzenal por quantidade", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "biweekly",
      intervalValue: 1,
      maxOccurrences: 3,
      endsAtLocalDate: null,
    });

    expect(starts).toHaveLength(3);
  });

  it("gera mensal por quantidade", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "monthly",
      intervalValue: 1,
      maxOccurrences: 3,
      endsAtLocalDate: null,
    });

    expect(starts).toHaveLength(3);
  });

  it("gera custom_days por quantidade", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "custom_days",
      intervalValue: 5,
      maxOccurrences: 4,
      endsAtLocalDate: null,
    });

    expect(starts).toHaveLength(4);
  });

  it("termina por data local", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "weekly",
      intervalValue: 1,
      maxOccurrences: null,
      endsAtLocalDate: "2026-09-05",
    });

    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts.length).toBeLessThanOrEqual(5);
  });

  it("respeita limite máximo de ocorrências", () => {
    const starts = expandRecurrenceStarts({
      startUtcIso: start,
      timeZone: tz,
      frequency: "custom_days",
      intervalValue: 1,
      maxOccurrences: 200,
      endsAtLocalDate: null,
    });

    expect(starts).toHaveLength(RECURRENCE_MAX_OCCURRENCES);
  });
});

describe("formatRecurrenceSkipSummary", () => {
  it("resume criação parcial por conflito", () => {
    expect(formatRecurrenceSkipSummary(5, 3)).toContain("5 de 8");
    expect(formatRecurrenceSkipSummary(5, 3)).toContain("3 não puderam");
  });
});
