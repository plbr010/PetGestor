import { z } from "zod";

import { TIME_BLOCK_REASONS } from "@/features/appointments/time-blocks/types";
import { isPastLocalDateTime } from "@/lib/timezone";

export const timeBlockFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Informe um horário inicial válido."),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Informe um horário final válido."),
    employeeId: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .refine((value) => value === null || z.uuid().safeParse(value).success, {
        message: "Profissional inválido.",
      }),
    reason: z
      .string()
      .trim()
      .min(1, "Informe o motivo.")
      .max(200, "Motivo muito longo."),
    companyTimezone: z.string().min(3),
  })
  .superRefine((data, ctx) => {
    if (data.endTime <= data.startTime) {
      ctx.addIssue({
        code: "custom",
        message: "O horário final deve ser posterior ao inicial.",
        path: ["endTime"],
      });
    }

    if (isPastLocalDateTime(data.date, data.endTime, data.companyTimezone)) {
      ctx.addIssue({
        code: "custom",
        message: "Não é possível bloquear horários totalmente no passado.",
        path: ["date"],
      });
    }
  });

export type TimeBlockFormInput = z.infer<typeof timeBlockFormSchema>;

export function parseTimeBlockForm(formData: FormData, companyTimezone: string) {
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const customReason = String(formData.get("customReason") ?? "").trim();
  const reason =
    reasonRaw === "custom"
      ? customReason
      : TIME_BLOCK_REASONS.includes(reasonRaw as (typeof TIME_BLOCK_REASONS)[number])
        ? reasonRaw
        : reasonRaw;

  return timeBlockFormSchema.safeParse({
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    employeeId: formData.get("employeeId"),
    reason,
    companyTimezone,
  });
}
