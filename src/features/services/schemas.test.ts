import { describe, expect, it } from "vitest";

import { parseServiceForm } from "@/features/services/schemas";

function buildFixedForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("name", "Banho");
  formData.set("description", "");
  formData.set("pricingMode", "fixed");
  formData.set("price", "89,90");
  formData.set("durationMinutes", "60");
  formData.set("active", "on");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

function buildBySizeForm() {
  const formData = new FormData();
  formData.set("name", "Banho por porte");
  formData.set("pricingMode", "by_size");
  formData.set("active", "on");

  const sizes = ["small", "medium", "large", "giant"] as const;
  const prices = ["45,00", "60,00", "80,00", "110,00"];
  const durations = ["30", "45", "60", "90"];

  sizes.forEach((size, index) => {
    formData.set(`size_${size}_price`, prices[index] ?? "0,00");
    formData.set(`size_${size}_duration`, durations[index] ?? "30");
  });

  return formData;
}

describe("parseServiceForm", () => {
  it("aceita serviço fixed válido", () => {
    const result = parseServiceForm(buildFixedForm());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricingMode).toBe("fixed");
      expect(result.data.priceCents).toBe(8990);
      expect(result.data.durationMinutes).toBe(60);
    }
  });

  it("rejeita fixed sem preço", () => {
    const result = parseServiceForm(buildFixedForm({ price: "" }));
    expect(result.success).toBe(false);
  });

  it("aceita serviço by_size com quatro portes", () => {
    const result = parseServiceForm(buildBySizeForm());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricingMode).toBe("by_size");
      expect(result.data.sizePrices).toHaveLength(4);
    }
  });

  it("rejeita by_size incompleto", () => {
    const formData = buildBySizeForm();
    formData.delete("size_giant_price");
    const result = parseServiceForm(formData);
    expect(result.success).toBe(false);
  });

  it("rejeita nome curto", () => {
    const result = parseServiceForm(buildFixedForm({ name: "A" }));
    expect(result.success).toBe(false);
  });
});
