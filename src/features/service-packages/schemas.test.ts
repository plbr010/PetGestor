import { describe, expect, it } from "vitest";

import { parseServicePackageForm, parseSellPackageForm } from "@/features/service-packages/schemas";

function buildPackageForm(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData();
  form.set("name", "Pacote Banho Mensal");
  form.set("description", "4 banhos");
  form.set("price", "160,00");
  form.set("validityDays", "30");
  form.set("active", "on");
  form.set("itemServiceId", "11111111-1111-4111-8111-111111111111");
  form.set("itemQuantity", "4");

  for (const [key, value] of Object.entries(overrides)) {
    if (Array.isArray(value)) {
      form.delete(key);
      for (const entry of value) {
        form.append(key, entry);
      }
    } else {
      form.set(key, value);
    }
  }

  return form;
}

describe("parseServicePackageForm", () => {
  it("valida criação de pacote com múltiplos serviços", () => {
    const form = buildPackageForm({
      itemServiceId: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      itemQuantity: ["4", "1"],
    });

    const parsed = parseServicePackageForm(form);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.priceCents).toBe(16000);
    }
  });

  it("rejeita pacote sem itens", () => {
    const form = buildPackageForm();
    form.delete("itemServiceId");
    form.delete("itemQuantity");

    const parsed = parseServicePackageForm(form);
    expect(parsed.success).toBe(false);
  });
});

describe("parseSellPackageForm", () => {
  it("valida venda pendente", () => {
    const form = new FormData();
    form.set("packageId", "11111111-1111-4111-8111-111111111111");
    form.set("startsAt", "2026-08-17");
    form.set("financialStatus", "pending");

    const parsed = parseSellPackageForm(form);
    expect(parsed.success).toBe(true);
  });

  it("valida venda paga com método", () => {
    const form = new FormData();
    form.set("packageId", "11111111-1111-4111-8111-111111111111");
    form.set("startsAt", "2026-08-17");
    form.set("financialStatus", "paid");
    form.set("paymentMethod", "pix");

    const parsed = parseSellPackageForm(form);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.paymentMethod).toBe("pix");
    }
  });
});
