import { describe, expect, it } from "vitest";

import {
  parseManualExpenseForm,
  parseManualIncomeForm,
  parseMarkPaidForm,
} from "@/features/finance/schemas";

function buildManualForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("description", "Venda avulsa");
  formData.set("category", "Venda avulsa");
  formData.set("amount", "80,00");
  formData.set("status", "pending");
  formData.set("notes", "");
  formData.set("idempotencyKey", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("parseManualIncomeForm", () => {
  it("aceita receita pendente sem forma de pagamento", () => {
    const result = parseManualIncomeForm(buildManualForm());
    expect(result.success).toBe(true);
  });

  it("exige forma de pagamento quando pago", () => {
    const result = parseManualIncomeForm(
      buildManualForm({ status: "paid", paymentMethod: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("aceita receita paga com pix", () => {
    const result = parseManualIncomeForm(
      buildManualForm({ status: "paid", paymentMethod: "pix" }),
    );
    expect(result.success).toBe(true);
  });

  it("exige chave de idempotência da criação", () => {
    const result = parseManualIncomeForm(buildManualForm({ idempotencyKey: "" }));
    expect(result.success).toBe(false);
  });

  it("rejeita pendente com forma de pagamento", () => {
    const result = parseManualIncomeForm(
      buildManualForm({ status: "pending", paymentMethod: "pix" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita valor zero", () => {
    const result = parseManualIncomeForm(buildManualForm({ amount: "0,00" }));
    expect(result.success).toBe(false);
  });
});

describe("parseManualExpenseForm", () => {
  it("aceita despesa válida", () => {
    const result = parseManualExpenseForm(buildManualForm({ description: "Energia" }));
    expect(result.success).toBe(true);
  });
});

describe("parseMarkPaidForm", () => {
  it("exige forma de pagamento", () => {
    const formData = new FormData();
    const result = parseMarkPaidForm(formData);
    expect(result.success).toBe(false);
  });

  it("aceita pagamento com pix", () => {
    const formData = new FormData();
    formData.set("paymentMethod", "pix");
    formData.set("idempotencyKey", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const result = parseMarkPaidForm(formData);
    expect(result.success).toBe(true);
  });

  it("aceita pagamento parcial com valor", () => {
    const formData = new FormData();
    formData.set("paymentMethod", "pix");
    formData.set("amount", "30,00");
    formData.set("idempotencyKey", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const result = parseMarkPaidForm(formData);
    expect(result.success).toBe(true);
  });
});
