import { z } from "zod";

import { MAX_FINANCE_AMOUNT_CENTS, parseAmountToCents } from "@/features/finance/utils";
import type { FinancialEntryType, PaymentMethod } from "@/types/database.types";

const paymentMethodSchema = z.enum([
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
] satisfies PaymentMethod[]);

const entryStatusSchema = z.enum(["pending", "paid"]);

function baseEntrySchema(entryType: FinancialEntryType) {
  return z
    .object({
      description: z
        .string()
        .trim()
        .min(2, "Informe uma descrição.")
        .max(160, "Descrição muito longa."),
      category: z
        .string()
        .trim()
        .max(80, "Categoria muito longa.")
        .transform((value) => (value.length === 0 ? null : value))
        .nullable(),
      amount: z.string().min(1, "Informe o valor."),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
        .nullable()
        .optional(),
      status: entryStatusSchema,
      paymentMethod: paymentMethodSchema.nullable(),
      notes: z
        .string()
        .trim()
        .max(3000, "Observações muito longas.")
        .transform((value) => (value.length === 0 ? null : value))
        .nullable(),
      entryType: z.literal(entryType),
    })
    .superRefine((data, ctx) => {
      const cents = parseAmountToCents(data.amount);

      if (cents === null || cents <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um valor válido maior que zero.",
          path: ["amount"],
        });
      } else if (cents > MAX_FINANCE_AMOUNT_CENTS) {
        ctx.addIssue({
          code: "custom",
          message: "Valor acima do limite permitido.",
          path: ["amount"],
        });
      }

      if (data.status === "paid" && !data.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          message: "Selecione a forma de pagamento.",
          path: ["paymentMethod"],
        });
      }

      if (data.status === "pending" && data.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          message: "Forma de pagamento só se aplica a lançamentos pagos.",
          path: ["paymentMethod"],
        });
      }
    });
}

export const manualIncomeSchema = baseEntrySchema("income");
export const manualExpenseSchema = baseEntrySchema("expense");

export const markPaidSchema = z.object({
  paymentMethod: paymentMethodSchema,
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora válidas.")
    .optional()
    .nullable(),
});

export const manualUpdateSchema = z
  .object({
    description: z.string().trim().min(2).max(160),
    category: z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value.length === 0 ? null : value))
      .nullable(),
    amount: z.string().min(1),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    notes: z
      .string()
      .trim()
      .max(3000)
      .transform((value) => (value.length === 0 ? null : value))
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const cents = parseAmountToCents(data.amount);
    if (cents === null || cents <= 0 || cents > MAX_FINANCE_AMOUNT_CENTS) {
      ctx.addIssue({
        code: "custom",
        message: "Informe um valor válido.",
        path: ["amount"],
      });
    }
  });

function parseFormEntry(formData: FormData, entryType: FinancialEntryType) {
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const paymentMethodRaw = formData.get("paymentMethod");
  const statusRaw = formData.get("status");

  return {
    description: formData.get("description"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    dueDate: dueDateRaw.length > 0 ? dueDateRaw : null,
    status: statusRaw === "paid" ? "paid" : "pending",
    paymentMethod:
      paymentMethodRaw === "cash" ||
      paymentMethodRaw === "pix" ||
      paymentMethodRaw === "debit_card" ||
      paymentMethodRaw === "credit_card" ||
      paymentMethodRaw === "bank_transfer" ||
      paymentMethodRaw === "other"
        ? paymentMethodRaw
        : null,
    notes: formData.get("notes"),
    entryType,
  };
}

export function parseManualIncomeForm(formData: FormData) {
  return manualIncomeSchema.safeParse(parseFormEntry(formData, "income"));
}

export function parseManualExpenseForm(formData: FormData) {
  return manualExpenseSchema.safeParse(parseFormEntry(formData, "expense"));
}

export function parseMarkPaidForm(formData: FormData) {
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();

  return markPaidSchema.safeParse({
    paymentMethod: formData.get("paymentMethod"),
    paidAt: paidAtRaw.length > 0 ? paidAtRaw : null,
  });
}

export function parseManualUpdateForm(formData: FormData) {
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();

  return manualUpdateSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    dueDate: dueDateRaw.length > 0 ? dueDateRaw : null,
    notes: formData.get("notes"),
  });
}
