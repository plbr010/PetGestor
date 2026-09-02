import { describe, expect, it } from "vitest";

import {
  buildAgendaHref,
  generateTimeSlots,
  groupAppointmentsByLocalDate,
  mapAppointmentError,
  parseAgendaDate,
  parseAgendaView,
} from "@/features/appointments/utils";

describe("mapAppointmentError", () => {
  it("mapeia conflito de funcionário", () => {
    expect(mapAppointmentError("employee_schedule_conflict")).toContain("profissional");
  });

  it("mapeia conflito de pet", () => {
    expect(mapAppointmentError("pet_schedule_conflict")).toContain("pet");
  });

  it("mapeia jornada", () => {
    expect(mapAppointmentError("outside_working_hours")).toContain("jornada");
  });

  it("mapeia pacote sem saldo", () => {
    expect(mapAppointmentError("package_balance_unavailable")).toMatch(/saldo/i);
  });

  it("mapeia pacote ainda não válido", () => {
    expect(mapAppointmentError("package_not_started")).toMatch(/válido/i);
  });
});

describe("generateTimeSlots", () => {
  it("gera intervalos de 15 minutos", () => {
    expect(generateTimeSlots("08:00", "08:45", 15)).toEqual(["08:00", "08:15", "08:30"]);
  });
});

describe("parseAgendaDate", () => {
  it("usa hoje quando inválido", () => {
    const today = parseAgendaDate(undefined, "America/Sao_Paulo");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("aceita data válida", () => {
    expect(parseAgendaDate("2026-08-10", "America/Sao_Paulo")).toBe("2026-08-10");
  });
});

describe("parseAgendaView", () => {
  it("default day", () => {
    expect(parseAgendaView(undefined)).toBe("day");
  });

  it("week quando solicitado", () => {
    expect(parseAgendaView("week")).toBe("week");
  });
});

describe("buildAgendaHref", () => {
  it("monta query string", () => {
    expect(buildAgendaHref({ date: "2026-08-10", view: "week", status: "confirmed" })).toBe(
      "/dashboard/agenda?date=2026-08-10&view=week&status=confirmed",
    );
  });
});

describe("groupAppointmentsByLocalDate", () => {
  it("agrupa por data local", () => {
    const grouped = groupAppointmentsByLocalDate(
      [
        { scheduled_start: "2026-08-10T12:00:00.000Z" },
        { scheduled_start: "2026-08-10T15:00:00.000Z" },
      ],
      "America/Sao_Paulo",
    );

    expect(grouped.size).toBeGreaterThan(0);
  });
});
