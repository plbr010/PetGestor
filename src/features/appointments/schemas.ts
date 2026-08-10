import { z } from "zod";

import { isPastLocalDate, isPastLocalDateTime } from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";
import type { PetSize } from "@/types/database.types";

const petSizeSchema = z.enum(["small", "medium", "large", "giant"] satisfies PetSize[]);

export const appointmentFormSchema = z
  .object({
    customerId: z.uuid().optional(),
    petId: z.uuid({ error: "Selecione um pet." }),
    serviceId: z.uuid({ error: "Selecione um serviço." }),
    employeeId: z.uuid({ error: "Selecione um profissional." }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Informe um horário válido."),
    petSize: petSizeSchema.nullable(),
    notes: z
      .string()
      .trim()
      .max(2000, "Observações muito longas.")
      .transform((value) => (value.length === 0 ? null : value))
      .nullable(),
    companyTimezone: z.string().min(3),
  })
  .superRefine((data, ctx) => {
    if (isPastLocalDate(data.date, data.companyTimezone)) {
      ctx.addIssue({
        code: "custom",
        message: "Não é possível agendar em data passada.",
        path: ["date"],
      });
    }

    if (isPastLocalDateTime(data.date, data.time, data.companyTimezone)) {
      ctx.addIssue({
        code: "custom",
        message: "Não é possível agendar em horário passado.",
        path: ["time"],
      });
    }
  });

export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>;

export const cancelAppointmentSchema = z.object({
  cancellationReason: z
    .string()
    .trim()
    .max(500, "Motivo muito longo.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export function parseAppointmentForm(formData: FormData, companyTimezone: string) {
  const petSizeRaw = formData.get("petSize");

  return appointmentFormSchema.safeParse({
    customerId: formData.get("customerId") || undefined,
    petId: formData.get("petId"),
    serviceId: formData.get("serviceId"),
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    time: formData.get("time"),
    petSize:
      petSizeRaw === "small" ||
      petSizeRaw === "medium" ||
      petSizeRaw === "large" ||
      petSizeRaw === "giant"
        ? petSizeRaw
        : null,
    notes: formData.get("notes"),
    companyTimezone,
  });
}

export function parseAppointmentIds(formData: FormData) {
  const petId = String(formData.get("petId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");

  if (!isValidUuid(petId) || !isValidUuid(serviceId) || !isValidUuid(employeeId)) {
    return null;
  }

  return { petId, serviceId, employeeId };
}
