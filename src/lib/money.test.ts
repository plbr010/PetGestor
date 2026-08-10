import { describe, expect, it } from "vitest";

import {
  formatCentsToBRL,
  formatCentsToInput,
  isValidDurationMinutes,
  isValidPriceCents,
  MAX_PRICE_CENTS,
  parseBRLToCents,
} from "@/lib/money";

describe("parseBRLToCents", () => {
  it("converte formatos comuns brasileiros", () => {
    expect(parseBRLToCents("45,00")).toBe(4500);
    expect(parseBRLToCents("89,90")).toBe(8990);
    expect(parseBRLToCents("1.234,56")).toBe(123456);
    expect(parseBRLToCents("R$ 89,90")).toBe(8990);
    expect(parseBRLToCents("  45  ")).toBe(4500);
  });

  it("rejeita valores negativos e formatos inválidos", () => {
    expect(parseBRLToCents("-10,00")).toBeNull();
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("")).toBeNull();
    expect(parseBRLToCents("1,234,56")).toBeNull();
  });

  it("respeita limite máximo", () => {
    expect(parseBRLToCents("9999,99")).toBe(999999);
    expect(parseBRLToCents("10000,00")).toBeNull();
  });
});

describe("formatCentsToBRL", () => {
  it("formata moeda brasileira", () => {
    expect(formatCentsToBRL(8990)).toBe("R$ 89,90");
    expect(formatCentsToBRL(4500)).toBe("R$ 45,00");
    expect(formatCentsToBRL(0)).toBe("R$ 0,00");
  });

  it("formatCentsToInput remove prefixo", () => {
    expect(formatCentsToInput(8990)).toBe("89,90");
  });
});

describe("validators", () => {
  it("valida centavos", () => {
    expect(isValidPriceCents(0)).toBe(true);
    expect(isValidPriceCents(MAX_PRICE_CENTS)).toBe(true);
    expect(isValidPriceCents(-1)).toBe(false);
    expect(isValidPriceCents(1.5)).toBe(false);
  });

  it("valida duração", () => {
    expect(isValidDurationMinutes(5)).toBe(true);
    expect(isValidDurationMinutes(720)).toBe(true);
    expect(isValidDurationMinutes(4)).toBe(false);
    expect(isValidDurationMinutes(721)).toBe(false);
  });
});
