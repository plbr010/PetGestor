import { describe, expect, it } from "vitest";

import { parseAppointmentForm } from "@/features/appointments/schemas";

function buildForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("petId", "550e8400-e29b-41d4-a716-446655440000");
  formData.set("serviceId", "550e8400-e29b-41d4-a716-446655440001");
  formData.set("employeeId", "550e8400-e29b-41d4-a716-446655440002");
  formData.set("date", "2099-12-31");
  formData.set("time", "10:00");
  formData.set("notes", "");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("parseAppointmentForm", () => {
  const timezone = "America/Sao_Paulo";

  it("aceita formulário válido", () => {
    const result = parseAppointmentForm(buildForm(), timezone);
    expect(result.success).toBe(true);
  });

  it("rejeita UUID inválido", () => {
    const result = parseAppointmentForm(buildForm({ petId: "invalid" }), timezone);
    expect(result.success).toBe(false);
  });

  it("rejeita data civil impossível", () => {
    const result = parseAppointmentForm(buildForm({ date: "2026-02-31" }), timezone);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Informe uma data válida.");
      expect(result.error.issues[0]?.path).toEqual(["date"]);
    }
  });

  it("aceita 29/02 em ano bissexto", () => {
    const result = parseAppointmentForm(buildForm({ date: "2028-02-29", time: "09:00" }), timezone);
    expect(result.success).toBe(true);
  });

  it("rejeita término de recorrência impossível", () => {
    const result = parseAppointmentForm(
      buildForm({
        repeatEnabled: "on",
        recurrenceFrequency: "weekly",
        recurrenceEndMode: "date",
        recurrenceEndsAt: "2026-04-31",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("recurrenceEndsAt"))).toBe(
        true,
      );
    }
  });

  it("rejeita data passada", () => {
    const result = parseAppointmentForm(buildForm({ date: "2000-01-01" }), timezone);
    expect(result.success).toBe(false);
  });

  it("rejeita horário inválido", () => {
    const result = parseAppointmentForm(buildForm({ time: "25:99" }), timezone);
    expect(result.success).toBe(false);
  });

  it("aceita porte válido", () => {
    const result = parseAppointmentForm(buildForm({ petSize: "medium" }), timezone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.petSize).toBe("medium");
    }
  });

  it("aceita recorrência semanal por quantidade", () => {
    const result = parseAppointmentForm(
      buildForm({
        repeatEnabled: "on",
        recurrenceFrequency: "weekly",
        recurrenceEndMode: "count",
        recurrenceMaxOccurrences: "8",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repeatEnabled).toBe(true);
      expect(result.data.recurrenceFrequency).toBe("weekly");
      expect(result.data.recurrenceMaxOccurrences).toBe(8);
    }
  });

  it("aceita custom_days com data final", () => {
    const result = parseAppointmentForm(
      buildForm({
        repeatEnabled: "true",
        recurrenceFrequency: "custom_days",
        recurrenceIntervalDays: "5",
        recurrenceEndMode: "date",
        recurrenceEndsAt: "2099-12-31",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(true);
  });

  it("rejeita recorrência sem término", () => {
    const result = parseAppointmentForm(
      buildForm({
        repeatEnabled: "on",
        recurrenceFrequency: "monthly",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 52 ocorrências", () => {
    const result = parseAppointmentForm(
      buildForm({
        repeatEnabled: "on",
        recurrenceFrequency: "weekly",
        recurrenceEndMode: "count",
        recurrenceMaxOccurrences: "53",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(false);
  });

  it("aceita pacote vendido opcional", () => {
    const result = parseAppointmentForm(
      buildForm({
        customerPackageId: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerPackageId).toBe("550e8400-e29b-41d4-a716-446655440099");
    }
  });

  it("trata pacote vazio como agendamento sem pacote", () => {
    const result = parseAppointmentForm(buildForm({ customerPackageId: "" }), timezone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerPackageId).toBeNull();
    }
  });

  it("rejeita pacote junto com recorrência", () => {
    const result = parseAppointmentForm(
      buildForm({
        customerPackageId: "550e8400-e29b-41d4-a716-446655440099",
        repeatEnabled: "on",
        recurrenceFrequency: "weekly",
        recurrenceEndMode: "count",
        recurrenceMaxOccurrences: "4",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
      }),
      timezone,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/recorrentes/i);
    }
  });
});
