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
});
