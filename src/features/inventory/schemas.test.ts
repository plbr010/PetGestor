import { describe, expect, it } from "vitest";

import {
  parseCategoryForm,
  parseProductForm,
  parseStockAdjustmentForm,
  parseStockEntryForm,
  parseStockExitForm,
  parseSupplierForm,
} from "@/features/inventory/schemas";

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDEMPOTENCY_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function productForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("name", "Shampoo Neutro");
  formData.set("sku", "");
  formData.set("barcode", "");
  formData.set("categoryId", "");
  formData.set("description", "");
  formData.set("unit", "ml");
  formData.set("costPrice", "8,50");
  formData.set("salePrice", "19,90");
  formData.set("minimumStock", "20,5");
  formData.set("active", "on");
  formData.set("trackStock", "on");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("parseProductForm", () => {
  it("aceita produto válido com quantidade fracionária no mínimo", () => {
    const result = parseProductForm(productForm());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.costPriceCents).toBe(850);
      expect(result.data.salePriceCents).toBe(1990);
      expect(result.data.minimumStock).toBe(20.5);
      expect(result.data.unit).toBe("ml");
    }
  });

  it("rejeita nome curto", () => {
    expect(parseProductForm(productForm({ name: "A" })).success).toBe(false);
  });

  it("rejeita unidade inválida", () => {
    expect(parseProductForm(productForm({ unit: "ton" })).success).toBe(false);
  });
});

describe("parseCategoryForm", () => {
  it("aceita categoria válida", () => {
    const formData = new FormData();
    formData.set("name", "Petiscos");
    const result = parseCategoryForm(formData);
    expect(result.success).toBe(true);
  });
});

describe("parseSupplierForm", () => {
  it("aceita fornecedor sem telefone", () => {
    const formData = new FormData();
    formData.set("name", "Distribuidora Pet");
    formData.set("contactName", "");
    formData.set("phone", "");
    formData.set("email", "");
    formData.set("document", "");
    formData.set("notes", "");
    formData.set("active", "on");
    expect(parseSupplierForm(formData).success).toBe(true);
  });

  it("rejeita telefone inválido", () => {
    const formData = new FormData();
    formData.set("name", "Distribuidora Pet");
    formData.set("phone", "123");
    formData.set("active", "on");
    expect(parseSupplierForm(formData).success).toBe(false);
  });
});

describe("parseStockEntryForm", () => {
  it("aceita entrada com lote e validade", () => {
    const formData = new FormData();
    formData.set("productId", PRODUCT_ID);
    formData.set("quantity", "12,5");
    formData.set("unitCost", "10,00");
    formData.set("supplierId", "");
    formData.set("batchCode", "L-01");
    formData.set("expirationDate", "2026-12-31");
    formData.set("notes", "Compra");
    formData.set("idempotencyKey", IDEMPOTENCY_KEY);

    const result = parseStockEntryForm(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(12.5);
      expect(result.data.unitCostCents).toBe(1000);
    }
  });
});

describe("parseStockExitForm", () => {
  it("exige observação para motivo outro", () => {
    const formData = new FormData();
    formData.set("productId", PRODUCT_ID);
    formData.set("quantity", "1");
    formData.set("reason", "other");
    formData.set("notes", "");
    formData.set("idempotencyKey", IDEMPOTENCY_KEY);
    expect(parseStockExitForm(formData).success).toBe(false);
  });

  it("aceita uso interno sem observação", () => {
    const formData = new FormData();
    formData.set("productId", PRODUCT_ID);
    formData.set("quantity", "1");
    formData.set("reason", "internal_use");
    formData.set("notes", "");
    formData.set("idempotencyKey", IDEMPOTENCY_KEY);
    expect(parseStockExitForm(formData).success).toBe(true);
  });
});

describe("parseStockAdjustmentForm", () => {
  it("aceita contagem zero", () => {
    const formData = new FormData();
    formData.set("productId", PRODUCT_ID);
    formData.set("countedStock", "0");
    formData.set("notes", "Inventário");
    formData.set("idempotencyKey", IDEMPOTENCY_KEY);
    const result = parseStockAdjustmentForm(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countedStock).toBe(0);
    }
  });
});
