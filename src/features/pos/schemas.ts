import { z } from "zod";

import { parseQuantityInput } from "@/features/inventory/stock-engine";
import { parseAmountToCents } from "@/features/finance/utils";
import type { PaymentMethod } from "@/types/database.types";

const paymentMethods = [
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
] as const satisfies readonly PaymentMethod[];

export const salePaymentSchema = z.object({
  amountCents: z.number().int().positive().max(99_999_999),
  paymentMethod: z.enum(paymentMethods),
  idempotencyKey: z.string().uuid(),
});

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(999_999.999),
  unitPriceCents: z.number().int().min(0).max(99_999_999),
});

export const completeSaleSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    customerId: z.string().uuid().nullable(),
    discountType: z.enum(["fixed", "percent"]).nullable(),
    discountFixedCents: z.number().int().min(0).max(99_999_999).default(0),
    discountPercent: z.number().min(0).max(100).nullable(),
    cashReceivedCents: z.number().int().min(0).max(99_999_999).nullable(),
    items: z.array(saleItemSchema).min(1),
    payments: z.array(salePaymentSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percent" && data.discountPercent == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o percentual de desconto.",
        path: ["discountPercent"],
      });
    }
  });

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "Informe um motivo com pelo menos 3 caracteres.").max(500),
});

export function parseCompleteSaleJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return completeSaleSchema.safeParse(parsed);
  } catch {
    return { success: false as const, error: new z.ZodError([]) };
  }
}

export function parseCancelSaleForm(formData: FormData) {
  return cancelSaleSchema.safeParse({
    reason: formData.get("reason"),
  });
}

export function parsePaymentAmountInput(raw: string): number | null {
  return parseAmountToCents(raw);
}

export function parseSaleQuantityInput(raw: string): number | null {
  return parseQuantityInput(raw);
}

export function parseDiscountPercentInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }

  return value;
}
