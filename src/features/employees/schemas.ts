import { z } from "zod";

import {
  parseWorkingHoursFromForm,
  WEEKDAYS,
} from "@/features/employees/utils";
import { isValidBrazilianPhone, normalizePhone } from "@/lib/phone";
import { isValidUuid } from "@/lib/security/uuid";

const optionalEmail = z
  .string()
  .trim()
  .max(254, "E-mail muito longo.")
  .transform((value) => (value.length === 0 ? null : value.toLowerCase()))
  .nullable()
  .refine((value) => value === null || z.email().safeParse(value).success, {
    message: "Informe um e-mail válido.",
  });

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : normalizePhone(value)))
  .nullable()
  .refine((value) => value === null || isValidBrazilianPhone(value), {
    message: "Informe um telefone brasileiro válido.",
  });

const optionalJobTitle = z
  .string()
  .trim()
  .max(80, "Cargo muito longo.")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const optionalNotes = z
  .string()
  .trim()
  .max(2000, "Observações muito longas.")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const workingHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
});

export const employeeFormSchema = z
  .object({
    name: z
      .string({ error: "Informe o nome do funcionário." })
      .trim()
      .min(2, "O nome deve ter pelo menos 2 caracteres.")
      .max(120, "Nome muito longo."),
    phone: optionalPhone,
    email: optionalEmail,
    jobTitle: optionalJobTitle,
    notes: optionalNotes,
    active: z.boolean(),
    canBeScheduled: z.boolean(),
    serviceIds: z.array(z.uuid()),
    workingHours: z.array(workingHourSchema).length(7),
  })
  .superRefine((data, ctx) => {
    for (const hour of data.workingHours) {
      if (!hour.enabled) {
        continue;
      }

      if (!hour.startTime || !hour.endTime) {
        ctx.addIssue({
          code: "custom",
          message: `Informe horário de início e fim para ${WEEKDAYS.find((d) => d.weekday === hour.weekday)?.label ?? "o dia"}.`,
          path: ["workingHours"],
        });
        continue;
      }

      if (hour.startTime >= hour.endTime) {
        ctx.addIssue({
          code: "custom",
          message: "O horário inicial deve ser anterior ao horário final.",
          path: ["workingHours"],
        });
      }
    }
  });

export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

export function parseEmployeeForm(formData: FormData) {
  const serviceIds = formData
    .getAll("serviceIds")
    .map(String)
    .filter((id) => isValidUuid(id));

  const workingHours = parseWorkingHoursFromForm(formData);

  if (!workingHours) {
    return employeeFormSchema.safeParse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      jobTitle: formData.get("jobTitle"),
      notes: formData.get("notes"),
      active: formData.get("active") === "on",
      canBeScheduled: formData.get("canBeScheduled") === "on",
      serviceIds,
      workingHours: [],
    });
  }

  return employeeFormSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    jobTitle: formData.get("jobTitle"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    canBeScheduled:
      formData.get("canBeScheduled") === "on" ||
      formData.get("canBeScheduled") === "true",
    serviceIds,
    workingHours,
  });
}
