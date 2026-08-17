import { z } from "zod";

import { WAITLIST_PERIODS } from "@/features/appointments/waitlist/types";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Informe uma data válida.",
  });

const optionalTime = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine((value) => value === null || /^([01]\d|2[0-3]):([0-5]\d)$/.test(value), {
    message: "Informe um horário válido.",
  });

export const waitlistFormSchema = z
  .object({
    customerId: z.uuid("Selecione um tutor."),
    petId: z.uuid("Selecione um pet."),
    serviceId: z.uuid("Selecione um serviço."),
    preferredEmployeeId: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .refine((value) => value === null || z.uuid().safeParse(value).success, {
        message: "Profissional inválido.",
      }),
    preferredDate: optionalDate,
    preferredPeriod: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .refine(
        (value) => value === null || WAITLIST_PERIODS.includes(value as (typeof WAITLIST_PERIODS)[number]),
        { message: "Período inválido." },
      ),
    preferredTimeStart: optionalTime,
    preferredTimeEnd: optionalTime,
    notes: optionalText(2000, "Observações muito longas."),
  })
  .superRefine((data, ctx) => {
    if (data.preferredTimeStart && !data.preferredTimeEnd) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o horário final da faixa preferida.",
        path: ["preferredTimeEnd"],
      });
    }

    if (!data.preferredTimeStart && data.preferredTimeEnd) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o horário inicial da faixa preferida.",
        path: ["preferredTimeStart"],
      });
    }

    if (
      data.preferredTimeStart &&
      data.preferredTimeEnd &&
      data.preferredTimeEnd <= data.preferredTimeStart
    ) {
      ctx.addIssue({
        code: "custom",
        message: "O horário final deve ser posterior ao inicial.",
        path: ["preferredTimeEnd"],
      });
    }
  });

export type WaitlistFormInput = z.infer<typeof waitlistFormSchema>;

export function parseWaitlistForm(formData: FormData) {
  return waitlistFormSchema.safeParse({
    customerId: formData.get("customerId"),
    petId: formData.get("petId"),
    serviceId: formData.get("serviceId"),
    preferredEmployeeId: formData.get("preferredEmployeeId"),
    preferredDate: formData.get("preferredDate"),
    preferredPeriod: formData.get("preferredPeriod"),
    preferredTimeStart: formData.get("preferredTimeStart"),
    preferredTimeEnd: formData.get("preferredTimeEnd"),
    notes: formData.get("notes"),
  });
}
