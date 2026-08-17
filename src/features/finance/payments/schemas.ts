import { z } from "zod";

import { MAX_FINANCE_AMOUNT_CENTS, parseAmountToCents } from "@/features/finance/utils";
import type { PaymentMethod } from "@/types/database.types";

const paymentMethodSchema = z.enum([
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
] satisfies PaymentMethod[]);

export const recordPaymentSchema = z.object({
  amount: z.string().min(1, "Informe o valor."),
  paymentMethod: paymentMethodSchema,
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora válidas.")
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500, "Observação muito longa.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
  idempotencyKey: z.string().trim().max(120).optional().nullable(),
});

export const closeCashSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  openingBalance: z.string().optional(),
  actualCash: z.string().optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Observação muito longa.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export function parseRecordPaymentForm(formData: FormData) {
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();

  return recordPaymentSchema.safeParse({
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    paidAt: paidAtRaw.length > 0 ? paidAtRaw : null,
    notes: formData.get("notes"),
    idempotencyKey: formData.get("idempotencyKey") || null,
  });
}

export function parseCloseCashForm(formData: FormData) {
  return closeCashSchema.safeParse({
    businessDate: formData.get("businessDate"),
    openingBalance: formData.get("openingBalance"),
    actualCash: formData.get("actualCash"),
    notes: formData.get("notes"),
  });
}

export function validatePaymentAmount(
  amountInput: string,
  remainingCents: number,
): { cents: number } | { error: string } {
  const cents = parseAmountToCents(amountInput);

  if (cents === null || cents <= 0) {
    return { error: "Informe um valor válido maior que zero." };
  }

  if (cents > MAX_FINANCE_AMOUNT_CENTS) {
    return { error: "Valor acima do limite permitido." };
  }

  if (cents > remainingCents) {
    return { error: "O valor excede o saldo restante." };
  }

  return { cents };
}
