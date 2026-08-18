import { z } from "zod";

import {
  parseNonNegativeQuantityInput,
  parseQuantityInput,
} from "@/features/inventory/stock-engine";
import { type ProductUnit, type StockExitReason } from "@/features/inventory/units";
import { MAX_INVENTORY_PRICE_CENTS, parseBRLToCents } from "@/lib/money";
import { isValidBrazilianPhone, normalizePhone } from "@/lib/phone";
import { isValidUuid } from "@/lib/security/uuid";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine((value) => value === null || isValidUuid(value), {
    message: "Seleção inválida.",
  });

function parseOptionalPrice(raw: FormDataEntryValue | null): number | null | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const cents = parseBRLToCents(trimmed, MAX_INVENTORY_PRICE_CENTS);
  return cents === null ? undefined : cents;
}

function parseRequiredPrice(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  return parseBRLToCents(trimmed, MAX_INVENTORY_PRICE_CENTS);
}

export const productFormSchema = z.object({
  name: z
    .string({ error: "Informe o nome do produto." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),
  sku: optionalText(64, "SKU muito longo."),
  barcode: optionalText(64, "Código de barras muito longo."),
  categoryId: optionalUuid,
  description: optionalText(2000, "Descrição muito longa."),
  unit: z.enum(["unit", "kg", "g", "ml", "l", "pack", "box", "other"] satisfies ProductUnit[], {
    error: "Informe a unidade.",
  }),
  costPriceCents: z
    .number({ error: "Informe o custo." })
    .int()
    .min(0, "Informe um custo válido.")
    .max(MAX_INVENTORY_PRICE_CENTS, "Informe um custo válido."),
  salePriceCents: z
    .number()
    .int()
    .min(0, "Informe um preço válido.")
    .max(MAX_INVENTORY_PRICE_CENTS, "Informe um preço válido.")
    .nullable(),
  minimumStock: z
    .number({ error: "Informe o estoque mínimo." })
    .min(0, "O estoque mínimo não pode ser negativo."),
  active: z.boolean(),
  trackStock: z.boolean(),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;

export function parseProductForm(formData: FormData) {
  const costPriceCents = parseRequiredPrice(formData.get("costPrice"));
  const saleRaw = formData.get("salePrice");
  const salePriceCents =
    typeof saleRaw === "string" && saleRaw.trim().length === 0
      ? null
      : parseOptionalPrice(saleRaw);
  const minimumStock = parseNonNegativeQuantityInput(String(formData.get("minimumStock") ?? "0"));

  return productFormSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    unit: formData.get("unit"),
    costPriceCents,
    salePriceCents,
    minimumStock,
    active: formData.get("active") === "on" || formData.get("active") === "true",
    trackStock: formData.get("trackStock") === "on" || formData.get("trackStock") === "true",
  });
}

export const categoryFormSchema = z.object({
  name: z
    .string({ error: "Informe o nome da categoria." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(80, "Nome muito longo."),
});

export function parseCategoryForm(formData: FormData) {
  return categoryFormSchema.safeParse({
    name: formData.get("name"),
  });
}

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : normalizePhone(value)))
  .nullable()
  .refine((value) => value === null || isValidBrazilianPhone(value), {
    message: "Informe um telefone brasileiro válido.",
  });

const optionalEmail = z
  .string()
  .trim()
  .max(254, "E-mail muito longo.")
  .transform((value) => (value.length === 0 ? null : value.toLowerCase()))
  .nullable()
  .refine((value) => value === null || z.email().safeParse(value).success, {
    message: "Informe um e-mail válido.",
  });

export const supplierFormSchema = z.object({
  name: z
    .string({ error: "Informe o nome do fornecedor." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),
  contactName: optionalText(120, "Nome do contato muito longo."),
  phone: optionalPhone,
  email: optionalEmail,
  document: optionalText(32, "Documento muito longo."),
  notes: optionalText(2000, "Observações muito longas."),
  active: z.boolean(),
});

export type SupplierFormInput = z.infer<typeof supplierFormSchema>;

export function parseSupplierForm(formData: FormData) {
  return supplierFormSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    document: formData.get("document"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
}

export const stockEntryFormSchema = z.object({
  productId: z.string().refine(isValidUuid, { message: "Produto inválido." }),
  quantity: z.number().positive("Informe uma quantidade válida."),
  unitCostCents: z
    .number({ error: "Informe o custo unitário." })
    .int()
    .min(0, "Informe um custo válido.")
    .max(MAX_INVENTORY_PRICE_CENTS, "Informe um custo válido."),
  supplierId: optionalUuid,
  batchCode: optionalText(80, "Lote muito longo."),
  expirationDate: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Informe uma validade válida.",
    }),
  notes: optionalText(2000, "Observação muito longa."),
  idempotencyKey: z.string().refine(isValidUuid, { message: "Operação inválida. Recarregue a página." }),
});

export function parseStockEntryForm(formData: FormData) {
  return stockEntryFormSchema.safeParse({
    productId: formData.get("productId"),
    quantity: parseQuantityInput(String(formData.get("quantity") ?? "")),
    unitCostCents: parseRequiredPrice(formData.get("unitCost")),
    supplierId: formData.get("supplierId"),
    batchCode: formData.get("batchCode"),
    expirationDate: formData.get("expirationDate"),
    notes: formData.get("notes"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

export const stockExitFormSchema = z
  .object({
    productId: z.string().refine(isValidUuid, { message: "Produto inválido." }),
    quantity: z.number().positive("Informe uma quantidade válida."),
    reason: z.enum(
      ["internal_use", "loss", "damage", "expired", "adjustment", "other"] satisfies StockExitReason[],
      {
        error: "Informe o motivo da saída.",
      },
    ),
    notes: optionalText(2000, "Observação muito longa."),
    idempotencyKey: z
      .string()
      .refine(isValidUuid, { message: "Operação inválida. Recarregue a página." }),
  })
  .superRefine((data, ctx) => {
    if ((data.reason === "other" || data.reason === "adjustment") && !data.notes) {
      ctx.addIssue({
        code: "custom",
        message: "Informe uma observação para este motivo.",
        path: ["notes"],
      });
    }
  });

export function parseStockExitForm(formData: FormData) {
  return stockExitFormSchema.safeParse({
    productId: formData.get("productId"),
    quantity: parseQuantityInput(String(formData.get("quantity") ?? "")),
    reason: formData.get("reason"),
    notes: formData.get("notes"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

export const stockAdjustmentFormSchema = z.object({
  productId: z.string().refine(isValidUuid, { message: "Produto inválido." }),
  countedStock: z.number().min(0, "A contagem física não pode ser negativa."),
  notes: optionalText(2000, "Observação muito longa."),
  idempotencyKey: z.string().refine(isValidUuid, { message: "Operação inválida. Recarregue a página." }),
});

export function parseStockAdjustmentForm(formData: FormData) {
  return stockAdjustmentFormSchema.safeParse({
    productId: formData.get("productId"),
    countedStock: parseNonNegativeQuantityInput(String(formData.get("countedStock") ?? "")),
    notes: formData.get("notes"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}
