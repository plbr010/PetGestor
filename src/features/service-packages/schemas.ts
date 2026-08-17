import { z } from "zod";

import { parseBRLToCents, isValidPriceCents } from "@/lib/money";
import { parsePriceInput } from "@/features/services/utils";
import type { PaymentMethod } from "@/types/database.types";

const optionalDescription = z
  .string()
  .trim()
  .max(2000, "Descrição muito longa.")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const packageItemSchema = z.object({
  serviceId: z.string().uuid("Selecione um serviço válido."),
  quantity: z
    .number()
    .int()
    .min(1, "Quantidade mínima: 1.")
    .max(999, "Quantidade máxima: 999."),
});

export const servicePackageFormSchema = z.object({
  name: z
    .string({ error: "Informe o nome do pacote." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),
  description: optionalDescription,
  priceCents: z.number().int().refine(isValidPriceCents, {
    message: "Informe um preço válido.",
  }),
  validityDays: z
    .number()
    .int()
    .min(1, "Validade mínima: 1 dia.")
    .max(3650, "Validade máxima: 3650 dias."),
  active: z.boolean(),
  items: z.array(packageItemSchema).min(1, "Adicione ao menos um serviço."),
});

export const sellPackageFormSchema = z.object({
  packageId: z.string().uuid("Selecione um pacote."),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data inicial."),
  financialStatus: z.enum(["pending", "paid"]),
  paymentMethod: z
    .enum([
      "cash",
      "pix",
      "debit_card",
      "credit_card",
      "bank_transfer",
      "other",
    ] satisfies PaymentMethod[])
    .nullable(),
});

export type ServicePackageFormInput = z.infer<typeof servicePackageFormSchema>;

function parsePackageItems(formData: FormData) {
  const serviceIds = formData.getAll("itemServiceId");
  const quantities = formData.getAll("itemQuantity");

  if (serviceIds.length === 0) {
    return [];
  }

  return serviceIds.map((serviceId, index) => ({
    serviceId: String(serviceId),
    quantity: Number(quantities[index] ?? 1),
  }));
}

export function parseServicePackageForm(formData: FormData) {
  const activeRaw = formData.get("active");
  const priceCents = parsePriceInput(formData.get("price"));
  const validityDays = Number(formData.get("validityDays"));

  return servicePackageFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceCents,
    validityDays: Number.isFinite(validityDays) ? validityDays : null,
    active: activeRaw === "on" || activeRaw === "true" || activeRaw === "1",
    items: parsePackageItems(formData),
  });
}

export function parseSellPackageForm(formData: FormData) {
  const financialStatus = formData.get("financialStatus");
  const paymentMethod = formData.get("paymentMethod");

  return sellPackageFormSchema.safeParse({
    packageId: formData.get("packageId"),
    startsAt: formData.get("startsAt"),
    financialStatus: financialStatus === "paid" ? "paid" : "pending",
    paymentMethod:
      paymentMethod && String(paymentMethod).length > 0
        ? String(paymentMethod)
        : null,
  });
}

export function parseBRLField(value: string): number | null {
  return parseBRLToCents(value);
}
