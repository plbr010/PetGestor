import { describe, expect, it } from "vitest";

import {
  formatElapsedSince,
  mapServiceOrderError,
  parseServiceOrderDate,
} from "@/features/service-orders/utils";

describe("mapServiceOrderError", () => {
  it("mapeia appointment não elegível", () => {
    expect(mapServiceOrderError("appointment_not_eligible")).toContain("check-in");
  });

  it("mapeia transição inválida", () => {
    expect(mapServiceOrderError("invalid_status_transition")).toContain("status");
  });

  it("mapeia cancelamento inválido", () => {
    expect(mapServiceOrderError("service_order_not_cancellable")).toContain("aguardando");
  });
});

describe("formatElapsedSince", () => {
  const now = new Date("2026-08-10T12:30:00Z").getTime();

  it("formata minutos", () => {
    expect(formatElapsedSince("2026-08-10T12:15:00Z", now)).toBe("há 15 min");
  });

  it("formata horas e minutos", () => {
    expect(formatElapsedSince("2026-08-10T11:10:00Z", now)).toBe("há 1h 20min");
  });
});

describe("parseServiceOrderDate", () => {
  it("aceita data válida", () => {
    expect(parseServiceOrderDate("2026-08-10", "America/Sao_Paulo")).toBe("2026-08-10");
  });
});
