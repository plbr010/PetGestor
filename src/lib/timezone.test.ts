import { describe, expect, it } from "vitest";

import { formatAppointmentDateLabel, groupAppointmentsByLocalDate } from "@/features/appointments/utils";
import {
  addDaysToDateString,
  civilDateWeekday,
  diffCivilDays,
  formatCivilDateLabel,
  formatCivilDateNumeric,
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  getCivilDayUtcBounds,
  getTodayInTimezone,
  getWeekDates,
  getWeekdayInTimezone,
  isPastLocalDate,
  isPastLocalDateTime,
  isValidCivilDate,
  localDateTimeToUtcIso,
  parseCivilDate,
  utcToCompanyLocal,
} from "@/lib/timezone";

describe("isValidCivilDate", () => {
  it("aceita datas reais, incluindo 29/02 em ano bissexto", () => {
    expect(isValidCivilDate("2026-10-10")).toBe(true);
    expect(isValidCivilDate("2028-02-29")).toBe(true);
    expect(isValidCivilDate("2026-01-31")).toBe(true);
  });

  it("rejeita datas impossíveis sem normalizar o dia", () => {
    expect(isValidCivilDate("2026-02-31")).toBe(false);
    expect(isValidCivilDate("2026-02-29")).toBe(false);
    expect(isValidCivilDate("2026-04-31")).toBe(false);
    expect(isValidCivilDate("2026-13-01")).toBe(false);
    expect(isValidCivilDate("2026-00-10")).toBe(false);
    expect(isValidCivilDate("2026-01-00")).toBe(false);
    expect(parseCivilDate("2026-02-31")).toBeNull();
  });
});

describe("formatCivilDateLabel — nunca desloca o dia civil", () => {
  it("10/10/2026 é sábado, nunca sexta 09/10, em qualquer timezone da empresa", () => {
    const labelSp = formatAppointmentDateLabel("2026-10-10", "America/Sao_Paulo");
    const labelUtc = formatAppointmentDateLabel("2026-10-10", "UTC");
    const labelNy = formatAppointmentDateLabel("2026-10-10", "America/New_York");
    const civil = formatCivilDateLabel("2026-10-10");

    for (const label of [labelSp, labelUtc, labelNy, civil]) {
      expect(label.toLowerCase()).toContain("sábado");
      expect(label).toContain("10");
      expect(label.toLowerCase()).not.toContain("sexta");
      expect(label).not.toMatch(/9 de outubro/i);
    }

    expect(civilDateWeekday("2026-10-10")).toBe(6);

    const shiftedWeekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date("2026-10-10"));
    expect(shiftedWeekday).toBe("Fri");
  });

  it("formata numérico sem deslocar", () => {
    expect(formatCivilDateNumeric("2026-10-10")).toBe("10/10/2026");
  });
});

describe("localDateTimeToUtcIso + timezone da empresa", () => {
  it("São Paulo: cria 10/10/2026 09:00 e exibe 10/10/2026 09:00", () => {
    const iso = localDateTimeToUtcIso("2026-10-10", "09:00", "America/Sao_Paulo");
    const local = utcToCompanyLocal(iso, "America/Sao_Paulo");
    expect(local).toEqual({ date: "2026-10-10", time: "09:00" });
    expect(formatUtcDateInTimezone(iso, "America/Sao_Paulo")).toBe("2026-10-10");
    expect(formatUtcInTimezone(iso, "America/Sao_Paulo")).toBe("09:00");
  });

  it("UTC: 10/10/2026 09:00 permanece 10/10/2026 09:00", () => {
    const iso = localDateTimeToUtcIso("2026-10-10", "09:00", "UTC");
    expect(iso).toBe("2026-10-10T09:00:00.000Z");
    expect(utcToCompanyLocal(iso, "UTC")).toEqual({ date: "2026-10-10", time: "09:00" });
  });

  it("America/New_York: cria e exibe a mesma data/hora civil", () => {
    const iso = localDateTimeToUtcIso("2026-10-10", "09:00", "America/New_York");
    expect(utcToCompanyLocal(iso, "America/New_York")).toEqual({
      date: "2026-10-10",
      time: "09:00",
    });
  });

  it("virada de dia em São Paulo não vaza para o dia seguinte", () => {
    const iso = localDateTimeToUtcIso("2026-10-10", "23:30", "America/Sao_Paulo");
    expect(utcToCompanyLocal(iso, "America/Sao_Paulo")).toEqual({
      date: "2026-10-10",
      time: "23:30",
    });
    expect(new Date(iso).toISOString().startsWith("2026-10-11")).toBe(true);
  });

  it("edição e reagendamento: UTC armazenado volta para a mesma data/hora civil", () => {
    for (const timeZone of ["America/Sao_Paulo", "UTC", "America/New_York"] as const) {
      const iso = localDateTimeToUtcIso("2026-10-10", "14:30", timeZone);
      const local = utcToCompanyLocal(iso, timeZone);
      expect(local).toEqual({ date: "2026-10-10", time: "14:30" });
      expect(localDateTimeToUtcIso(local.date, local.time, timeZone)).toBe(iso);
    }
  });

  it("reagendamento escolhido 11/10 10:00 permanece 11/10 10:00", () => {
    const iso = localDateTimeToUtcIso("2026-10-11", "10:00", "America/Sao_Paulo");
    expect(utcToCompanyLocal(iso, "America/Sao_Paulo")).toEqual({
      date: "2026-10-11",
      time: "10:00",
    });
  });

  it("recusa YYYY-MM-DD inválido em vez de Date.UTC normalizar o dia", () => {
    expect(() => localDateTimeToUtcIso("2026-02-31", "09:00", "UTC")).toThrow("invalid_civil_date");
    const normalized = new Date(Date.UTC(2026, 1, 31)).toISOString().slice(0, 10);
    expect(normalized).toBe("2026-03-03");
  });
});

describe("limites do dia civil da agenda", () => {
  it("agenda diária usa o dia civil da empresa, não UTC", () => {
    const bounds = getCivilDayUtcBounds("2026-10-10", "America/Sao_Paulo");
    const late = localDateTimeToUtcIso("2026-10-10", "23:00", "America/Sao_Paulo");
    const nextMidnight = localDateTimeToUtcIso("2026-10-11", "00:00", "America/Sao_Paulo");

    expect(late >= bounds.start && late < bounds.end).toBe(true);
    expect(nextMidnight >= bounds.end).toBe(true);
  });

  it("agenda semanal agrupa no dia civil correto", () => {
    const iso = localDateTimeToUtcIso("2026-10-10", "09:00", "America/Sao_Paulo");
    const grouped = groupAppointmentsByLocalDate([{ scheduled_start: iso }], "America/Sao_Paulo");
    expect([...grouped.keys()]).toEqual(["2026-10-10"]);
  });
});

describe("DST America/New_York", () => {
  it("preserva 09:00 civil na primavera (spring forward)", () => {
    const before = localDateTimeToUtcIso("2026-03-07", "09:00", "America/New_York");
    const after = localDateTimeToUtcIso("2026-03-14", "09:00", "America/New_York");

    expect(utcToCompanyLocal(before, "America/New_York").time).toBe("09:00");
    expect(utcToCompanyLocal(after, "America/New_York").time).toBe("09:00");
    expect(new Date(after).getTime() - new Date(before).getTime()).not.toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("preserva 09:00 civil no outono (fall back)", () => {
    const before = localDateTimeToUtcIso("2026-10-31", "09:00", "America/New_York");
    const after = localDateTimeToUtcIso("2026-11-07", "09:00", "America/New_York");

    expect(utcToCompanyLocal(before, "America/New_York")).toEqual({
      date: "2026-10-31",
      time: "09:00",
    });
    expect(utcToCompanyLocal(after, "America/New_York")).toEqual({
      date: "2026-11-07",
      time: "09:00",
    });
  });

  it("hora inexistente no spring forward é rejeitada, não normalizada", () => {
    expect(() => localDateTimeToUtcIso("2026-03-08", "02:30", "America/New_York")).toThrow(
      "invalid_local_time",
    );
  });

  it("01:30 no fall back converte e reexibe 01:30 local", () => {
    const iso = localDateTimeToUtcIso("2026-11-01", "01:30", "America/New_York");
    expect(utcToCompanyLocal(iso, "America/New_York")).toEqual({
      date: "2026-11-01",
      time: "01:30",
    });
  });
});

describe("helpers civis", () => {
  it("addDaysToDateString e diffCivilDays não usam 24h UTC", () => {
    expect(addDaysToDateString("2026-10-10", 1)).toBe("2026-10-11");
    expect(diffCivilDays("2026-10-10", "2026-10-17")).toBe(7);
    expect(civilDateWeekday("2026-10-10")).toBe(6);
  });

  it("getWeekDates retorna 7 datas civis", () => {
    expect(getWeekDates("2026-10-10")).toHaveLength(7);
    expect(getWeekDates("2026-10-10")[6]).toBe("2026-10-10");
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

describe("isPastLocalDate", () => {
  it("identifica data passada", () => {
    expect(isPastLocalDate("2000-01-01", "America/Sao_Paulo")).toBe(true);
  });
});

describe("isPastLocalDateTime", () => {
  it("identifica horário passado", () => {
    expect(isPastLocalDateTime("2000-01-01", "08:00", "America/Sao_Paulo")).toBe(true);
  });

  it("não lança em horário com formato inválido", () => {
    expect(isPastLocalDateTime("2099-12-31", "25:99", "America/Sao_Paulo")).toBe(true);
  });
});

describe("getTodayInTimezone", () => {
  it("retorna YYYY-MM-DD", () => {
    expect(getTodayInTimezone("America/Sao_Paulo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa fallback para timezone inválido", () => {
    expect(() => getTodayInTimezone("Invalid/Zone")).not.toThrow();
    expect(getTodayInTimezone("Invalid/Zone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
