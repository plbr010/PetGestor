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

export const registerSalePaymentSchema = z.object({
  amountCents: z.number().int().positive("Informe um valor maior que zero.").max(99_999_999),
  paymentMethod: z.enum(paymentMethods),
  idempotencyKey: z.string().uuid(),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora válidas.")
    .optional()
    .nullable(),
});

export const openCashSessionSchema = z.object({
  openingBalanceCents: z.number().int().min(0).max(99_999_999),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
});

export const closeCashSessionSchema = z.object({
  sessionId: z.string().uuid(),
  countedCashCents: z.number().int().min(0).max(99_999_999),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
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

export function parseRegisterSalePaymentForm(formData: FormData) {
  const amountCents = parsePaymentAmountInput(String(formData.get("amount") ?? ""));
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();

  return registerSalePaymentSchema.safeParse({
    amountCents: amountCents ?? 0,
    paymentMethod: formData.get("paymentMethod"),
    idempotencyKey: formData.get("idempotencyKey"),
    paidAt: paidAtRaw.length > 0 ? paidAtRaw : null,
  });
}

export function parseOpenCashSessionForm(formData: FormData) {
  const opening = parsePaymentAmountInput(String(formData.get("openingBalance") ?? "0"));

  return openCashSessionSchema.safeParse({
    openingBalanceCents: opening ?? 0,
    notes: formData.get("notes")?.toString() || undefined,
  });
}

export function parseCloseCashSessionForm(formData: FormData) {
  const counted = parsePaymentAmountInput(String(formData.get("countedCash") ?? ""));

  return closeCashSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    countedCashCents: counted ?? -1,
    notes: formData.get("notes")?.toString() || undefined,
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
