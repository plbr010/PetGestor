import { describe, expect, it } from "vitest";

import {
  canTransitionStatus,
  parseAppointmentStatusFilter,
} from "@/features/appointments/status";

describe("appointment status transitions", () => {
  it("permite scheduled → confirmed", () => {
    expect(canTransitionStatus("scheduled", "confirmed")).toBe(true);
  });

  it("permite scheduled → cancelled e no_show", () => {
    expect(canTransitionStatus("scheduled", "cancelled")).toBe(true);
    expect(canTransitionStatus("scheduled", "no_show")).toBe(true);
  });

  it("permite confirmed → cancelled e no_show", () => {
    expect(canTransitionStatus("confirmed", "cancelled")).toBe(true);
    expect(canTransitionStatus("confirmed", "no_show")).toBe(true);
  });

  it("bloqueia cancelled → confirmed", () => {
    expect(canTransitionStatus("cancelled", "confirmed")).toBe(false);
  });

  it("bloqueia no_show → confirmed", () => {
    expect(canTransitionStatus("no_show", "confirmed")).toBe(false);
  });
});

describe("parseAppointmentStatusFilter", () => {
  it("retorna all por padrão", () => {
    expect(parseAppointmentStatusFilter(undefined)).toBe("all");
    expect(parseAppointmentStatusFilter("invalid")).toBe("all");
  });

  it("aceita filtros válidos", () => {
    expect(parseAppointmentStatusFilter("scheduled")).toBe("scheduled");
    expect(parseAppointmentStatusFilter("confirmed")).toBe("confirmed");
    expect(parseAppointmentStatusFilter("cancelled")).toBe("cancelled");
    expect(parseAppointmentStatusFilter("no_show")).toBe("no_show");
  });
});
