import { describe, expect, it } from "vitest";

import {
  parseCheckInForm,
  parseCompleteServiceOrderForm,
  parseServiceOrderNotesForm,
} from "@/features/service-orders/schemas";

describe("service order schemas", () => {
  it("aceita check-in sem observações", () => {
    const formData = new FormData();
    formData.set("intakeNotes", "");
    const result = parseCheckInForm(formData);
    expect(result.success).toBe(true);
  });

  it("rejeita intake notes muito longas", () => {
    const formData = new FormData();
    formData.set("intakeNotes", "a".repeat(3001));
    const result = parseCheckInForm(formData);
    expect(result.success).toBe(false);
  });

  it("aceita notas válidas", () => {
    const formData = new FormData();
    formData.set("intakeNotes", "Pet chegou bem");
    formData.set("internalNotes", "Observação interna");
    formData.set("completionNotes", "");
    const result = parseServiceOrderNotesForm(formData);
    expect(result.success).toBe(true);
  });

  it("rejeita internal notes muito longas", () => {
    const formData = new FormData();
    formData.set("intakeNotes", "");
    formData.set("internalNotes", "a".repeat(5001));
    formData.set("completionNotes", "");
    const result = parseServiceOrderNotesForm(formData);
    expect(result.success).toBe(false);
  });

  it("aceita finalização com notas opcionais", () => {
    const formData = new FormData();
    formData.set("completionNotes", "Entrega realizada");
    const result = parseCompleteServiceOrderForm(formData);
    expect(result.success).toBe(true);
  });
});
