import { z } from "zod";

import { isValidBrazilianPhone, normalizePhone } from "@/lib/phone";

const optionalEmail = z
  .string()
  .trim()
  .max(254, "E-mail muito longo.")
  .transform((value) => (value.length === 0 ? null : value.toLowerCase()))
  .nullable()
  .refine((value) => value === null || z.email().safeParse(value).success, {
    message: "Informe um e-mail válido.",
  });

const optionalNotes = z
  .string()
  .trim()
  .max(2000, "Observações muito longas.")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const customerFormSchema = z.object({
  name: z
    .string({ error: "Informe o nome do tutor." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),
  phone: z
    .string({ error: "Informe o telefone." })
    .trim()
    .transform(normalizePhone)
    .refine(isValidBrazilianPhone, {
      message: "Informe um telefone brasileiro válido.",
    }),
  email: optionalEmail,
  notes: optionalNotes,
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;

export function parseCustomerForm(formData: FormData) {
  return customerFormSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    notes: formData.get("notes"),
  });
}
