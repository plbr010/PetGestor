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

  it("monta link do WhatsApp com mensagem pré-preenchida codificada", () => {
    expect(
      buildWhatsAppUrl("32998064217", "Olá, tenho uma dúvida sobre o PetGestor."),
    ).toBe(
      "https://wa.me/5532998064217?text=Ol%C3%A1%2C%20tenho%20uma%20d%C3%BAvida%20sobre%20o%20PetGestor.",
    );
  });
});

