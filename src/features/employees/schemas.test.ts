import { describe, expect, it } from "vitest";

import { parseEmployeeForm } from "@/features/employees/schemas";

function buildEmployeeForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("name", "João Silva");
  formData.set("jobTitle", "Tosador");
  formData.set("phone", "(32) 99999-9999");
  formData.set("email", "joao@email.com");
  formData.set("canBeScheduled", "on");
  formData.set("active", "on");

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (weekday === 0) {
      continue;
    }

    formData.set(`weekday_${weekday}_enabled`, "on");
    formData.set(`weekday_${weekday}_start`, weekday === 6 ? "08:00" : "08:00");
    formData.set(`weekday_${weekday}_end`, weekday === 6 ? "13:00" : "18:00");
  }

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("parseEmployeeForm", () => {
  it("aceita funcionário válido", () => {
    const result = parseEmployeeForm(buildEmployeeForm());
    expect(result.success).toBe(true);
  });

  it("rejeita nome curto", () => {
    const result = parseEmployeeForm(buildEmployeeForm({ name: "A" }));
    expect(result.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const result = parseEmployeeForm(buildEmployeeForm({ email: "invalido" }));
    expect(result.success).toBe(false);
  });

  it("rejeita horário invertido", () => {
    const formData = buildEmployeeForm();
    formData.set("weekday_1_start", "18:00");
    formData.set("weekday_1_end", "08:00");
    const result = parseEmployeeForm(formData);
    expect(result.success).toBe(false);
  });

  it("rejeita dia habilitado sem horário", () => {
    const formData = buildEmployeeForm();
    formData.delete("weekday_1_start");
    const result = parseEmployeeForm(formData);
    expect(result.success).toBe(false);
  });
});
