import { describe, expect, it } from "vitest";

import {
  canTransitionServiceOrderStatus,
  isAppointmentCheckInEligible,
  isNotesEditableStatus,
  parseServiceOrderStatusFilter,
} from "@/features/service-orders/status";

describe("service order status transitions", () => {
  it("permite waiting → in_progress e cancelled", () => {
    expect(canTransitionServiceOrderStatus("waiting", "in_progress")).toBe(true);
    expect(canTransitionServiceOrderStatus("waiting", "cancelled")).toBe(true);
  });

  it("permite in_progress → ready", () => {
    expect(canTransitionServiceOrderStatus("in_progress", "ready")).toBe(true);
  });

  it("permite ready → completed", () => {
    expect(canTransitionServiceOrderStatus("ready", "completed")).toBe(true);
  });

  it("bloqueia completed → cancelled", () => {
    expect(canTransitionServiceOrderStatus("completed", "cancelled")).toBe(false);
  });

  it("bloqueia in_progress → cancelled", () => {
    expect(canTransitionServiceOrderStatus("in_progress", "cancelled")).toBe(false);
  });
});

describe("isAppointmentCheckInEligible", () => {
  it("aceita scheduled, confirmed e in_progress", () => {
    expect(isAppointmentCheckInEligible("scheduled")).toBe(true);
    expect(isAppointmentCheckInEligible("confirmed")).toBe(true);
    expect(isAppointmentCheckInEligible("in_progress")).toBe(true);
  });

  it("rejeita cancelled, no_show e completed", () => {
    expect(isAppointmentCheckInEligible("cancelled")).toBe(false);
    expect(isAppointmentCheckInEligible("no_show")).toBe(false);
    expect(isAppointmentCheckInEligible("completed")).toBe(false);
  });
});

describe("parseServiceOrderStatusFilter", () => {
  it("retorna all por padrão", () => {
    expect(parseServiceOrderStatusFilter(undefined)).toBe("all");
  });

  it("aceita filtros válidos", () => {
    expect(parseServiceOrderStatusFilter("waiting")).toBe("waiting");
    expect(parseServiceOrderStatusFilter("ready")).toBe("ready");
  });
});

describe("isNotesEditableStatus", () => {
  it("permite edição exceto cancelled", () => {
    expect(isNotesEditableStatus("waiting")).toBe(true);
    expect(isNotesEditableStatus("cancelled")).toBe(false);
  });
});
