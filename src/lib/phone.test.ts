import { describe, expect, it } from "vitest";

import {
  formatPhoneDisplay,
  formatPhoneInput,
  isValidBrazilianPhone,
  normalizePhone,
} from "@/lib/phone";

describe("phone helpers", () => {
  it("normaliza telefone brasileiro", () => {
    expect(normalizePhone("(32) 99999-9999")).toBe("32999999999");
  });

  it("formata telefone para exibição", () => {
    expect(formatPhoneDisplay("32999999999")).toBe("(32) 99999-9999");
  });

  it("formata telefone durante digitação parcial", () => {
    expect(formatPhoneInput("32999999999")).toBe("(32) 99999-9999");
  });

  it("valida telefone brasileiro", () => {
    expect(isValidBrazilianPhone("(32) 99999-9999")).toBe(true);
    expect(isValidBrazilianPhone("123")).toBe(false);
  });
});
