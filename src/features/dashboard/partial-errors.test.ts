import { describe, expect, it } from "vitest";

import { formatDashboardPartialErrors } from "@/features/dashboard/partial-errors";

describe("formatDashboardPartialErrors", () => {
  it("ignora falhas apenas em módulos opcionais", () => {
    expect(formatDashboardPartialErrors(["finance", "inventory"])).toBeNull();
  });

  it("mostra falhas em módulos principais", () => {
    const message = formatDashboardPartialErrors(["customers", "appointments-today"]);
    expect(message).toMatch(/tutores/);
    expect(message).toMatch(/agenda de hoje/);
  });

  it("retorna null quando não há erros", () => {
    expect(formatDashboardPartialErrors([])).toBeNull();
  });
});
