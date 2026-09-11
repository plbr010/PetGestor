import { describe, expect, it } from "vitest";

import {
  appointmentFitsWorkingHours,
  appointmentOverlapsBreak,
  slotSurvivesWorkingHours,
} from "@/features/appointments/working-hours";

const WINDOW = {
  enabled: true,
  startTime: "08:00",
  endTime: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
};

function fit(start: string, duration: number, window = WINDOW) {
  return appointmentFitsWorkingHours({ startTime: start, durationMinutes: duration, window });
}

describe("jornada 08:00–18:00 com intervalo 12:00–13:00", () => {
  it("permite 08:00", () => {
    expect(fit("08:00", 60).ok).toBe(true);
  });

  it("permite 11:00–12:00", () => {
    expect(fit("11:00", 60).ok).toBe(true);
  });

  it("nega 11:30–12:30", () => {
    expect(fit("11:30", 60)).toEqual({ ok: false, reason: "lunch_break" });
  });

  it("nega 12:00–13:00", () => {
    expect(fit("12:00", 60)).toEqual({ ok: false, reason: "lunch_break" });
  });

  it("nega 12:30–13:30", () => {
    expect(fit("12:30", 60)).toEqual({ ok: false, reason: "lunch_break" });
  });

  it("permite 13:00", () => {
    expect(fit("13:00", 60).ok).toBe(true);
  });

  it("permite terminar exatamente às 18:00", () => {
    expect(fit("17:00", 60).ok).toBe(true);
  });

  it("nega ultrapassar 18:00", () => {
    expect(fit("17:15", 60)).toEqual({ ok: false, reason: "outside_hours" });
    expect(fit("17:30", 60)).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("nega começar antes da jornada", () => {
    expect(fit("07:30", 60)).toEqual({ ok: false, reason: "outside_hours" });
  });
});

describe("dia sem jornada e intervalo ausente", () => {
  it("nega dia não trabalhado", () => {
    expect(
      fit("09:00", 60, {
        enabled: false,
        startTime: null,
        endTime: null,
        breakStart: null,
        breakEnd: null,
      }),
    ).toEqual({ ok: false, reason: "no_shift" });
  });

  it("permite horário contínuo quando não há intervalo", () => {
    expect(
      fit("11:30", 60, {
        enabled: true,
        startTime: "08:00",
        endTime: "18:00",
        breakStart: null,
        breakEnd: null,
      }).ok,
    ).toBe(true);
    expect(appointmentOverlapsBreak(11 * 60 + 30, 12 * 60 + 30, null, null)).toBe(false);
  });

  it("intervalo só com um lado não bloqueia no helper — o cadastro é rejeitado no schema/banco", () => {
    expect(appointmentOverlapsBreak(12 * 60, 13 * 60, "12:00", null)).toBe(false);
    expect(appointmentOverlapsBreak(12 * 60, 13 * 60, null, "13:00")).toBe(false);
  });
});

describe("funcionário com jornada diferente", () => {
  it("sábado 08:00–13:00 não aceita 14:00", () => {
    expect(
      slotSurvivesWorkingHours("14:00", 60, {
        enabled: true,
        startTime: "08:00",
        endTime: "13:00",
        breakStart: null,
        breakEnd: null,
      }),
    ).toBe(false);
  });

  it("sábado 08:00–13:00 aceita 08:00", () => {
    expect(
      slotSurvivesWorkingHours("08:00", 60, {
        enabled: true,
        startTime: "08:00",
        endTime: "13:00",
        breakStart: null,
        breakEnd: null,
      }),
    ).toBe(true);
  });
});
