import { describe, expect, it } from "vitest";

import {
  buildWhatsAppUrl,
  formatPhoneDisplay,
  formatPhoneInput,
  isValidBrazilianPhone,
  normalizePhone,
  toE164Brazil,
} from "@/lib/phone";

describe("phone helpers", () => {
  it("normaliza telefone brasileiro", () => {
    expect(normalizePhone("(32) 99999-9999")).toBe("32999999999");
  });

  it("converte para E.164", () => {
    expect(toE164Brazil("(32) 99999-9999")).toBe("+5532999999999");
    expect(toE164Brazil("32999999999")).toBe("+5532999999999");
    expect(toE164Brazil("+55 32 99999-9999")).toBe("+5532999999999");
  });

  it("formata telefone para exibição a partir de E.164", () => {
    expect(formatPhoneDisplay("+5532999999999")).toBe("(32) 99999-9999");
    expect(formatPhoneDisplay("32999999999")).toBe("(32) 99999-9999");
  });

  it("formata telefone durante digitação parcial", () => {
    expect(formatPhoneInput("32999999999")).toBe("(32) 99999-9999");
  });

  it("valida telefone brasileiro", () => {
    expect(isValidBrazilianPhone("(32) 99999-9999")).toBe(true);
    expect(isValidBrazilianPhone("+5532999999999")).toBe(true);
    expect(isValidBrazilianPhone("123")).toBe(false);
    expect(isValidBrazilianPhone("00999999999")).toBe(false);
  });

  it("monta link do WhatsApp com número normalizado", () => {
    expect(buildWhatsAppUrl("+5532999999999")).toBe("https://wa.me/5532999999999");
    expect(buildWhatsAppUrl("(32) 99999-9999")).toBe("https://wa.me/5532999999999");
    expect(buildWhatsAppUrl("abc")).toBeNull();
  });
});
