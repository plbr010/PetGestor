import { z } from "zod";

import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MAX_OCCURRENCES,
  type RecurrenceFrequency,
} from "@/features/appointments/recurrence";
import { isPastLocalDate, isPastLocalDateTime } from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";
import type { PetSize } from "@/types/database.types";

const petSizeSchema = z.enum(["small", "medium", "large", "giant"] satisfies PetSize[]);

const recurrenceFrequencySchema = z.enum(
  RECURRENCE_FREQUENCIES as unknown as [RecurrenceFrequency, ...RecurrenceFrequency[]],
);

export const seriesScopeSchema = z.enum(["this", "this_and_following"]);

export type SeriesScope = z.infer<typeof seriesScopeSchema>;

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
    repeatEnabled: z.boolean().default(false),
    recurrenceFrequency: recurrenceFrequencySchema.optional(),
    recurrenceIntervalDays: z.coerce.number().int().min(1).max(365).optional(),
    recurrenceEndMode: z.enum(["count", "date"]).optional(),
    recurrenceMaxOccurrences: z.coerce
      .number()
      .int()
      .min(2, "Informe pelo menos 2 ocorrências.")
      .max(RECURRENCE_MAX_OCCURRENCES, `Máximo de ${RECURRENCE_MAX_OCCURRENCES} ocorrências.`)
      .optional(),
    recurrenceEndsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data final válida.")
      .optional()
      .nullable(),
    seriesScope: seriesScopeSchema.optional(),
    customerPackageId: z.uuid().optional().nullable(),
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

    if (!data.repeatEnabled) {
      return;
    }

    if (!data.recurrenceFrequency) {
      ctx.addIssue({
        code: "custom",
        message: "Selecione a frequência da recorrência.",
        path: ["recurrenceFrequency"],
      });
      return;
    }

    if (data.recurrenceFrequency === "custom_days") {
      if (!data.recurrenceIntervalDays || data.recurrenceIntervalDays < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Informe o intervalo em dias.",
          path: ["recurrenceIntervalDays"],
        });
      }
    }

    if (data.recurrenceEndMode === "count") {
      if (!data.recurrenceMaxOccurrences) {
        ctx.addIssue({
          code: "custom",
          message: "Informe quantas vezes o agendamento deve se repetir.",
          path: ["recurrenceMaxOccurrences"],
        });
      }
    } else if (data.recurrenceEndMode === "date") {
      if (!data.recurrenceEndsAt) {
        ctx.addIssue({
          code: "custom",
          message: "Informe a data final da recorrência.",
          path: ["recurrenceEndsAt"],
        });
      } else if (data.recurrenceEndsAt < data.date) {
        ctx.addIssue({
          code: "custom",
          message: "A data final deve ser igual ou posterior à data inicial.",
          path: ["recurrenceEndsAt"],
        });
      }
    } else {
      ctx.addIssue({
        code: "custom",
        message: "Escolha como a recorrência termina.",
        path: ["recurrenceEndMode"],
      });
    }

    if (data.customerPackageId) {
      ctx.addIssue({
        code: "custom",
        message:
          "Pacotes não podem ser usados em agendamentos recorrentes. Crie cada sessão avulsa para consumir o saldo.",
        path: ["customerPackageId"],
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
  seriesScope: seriesScopeSchema.default("this"),
});

function parseBooleanFormValue(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

export function parseAppointmentForm(formData: FormData, companyTimezone: string) {
  const petSizeRaw = formData.get("petSize");
  const repeatEnabled = parseBooleanFormValue(formData.get("repeatEnabled"));
  const frequencyRaw = String(formData.get("recurrenceFrequency") ?? "");
  const endModeRaw = String(formData.get("recurrenceEndMode") ?? "");
  const seriesScopeRaw = String(formData.get("seriesScope") ?? "");
  const customerPackageRaw = String(formData.get("customerPackageId") ?? "").trim();

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
    repeatEnabled,
    recurrenceFrequency: repeatEnabled
      ? RECURRENCE_FREQUENCIES.includes(frequencyRaw as RecurrenceFrequency)
        ? frequencyRaw
        : undefined
      : undefined,
    recurrenceIntervalDays: formData.get("recurrenceIntervalDays") || undefined,
    recurrenceEndMode:
      endModeRaw === "count" || endModeRaw === "date" ? endModeRaw : undefined,
    recurrenceMaxOccurrences: formData.get("recurrenceMaxOccurrences") || undefined,
    recurrenceEndsAt: formData.get("recurrenceEndsAt") || null,
    seriesScope:
      seriesScopeRaw === "this" || seriesScopeRaw === "this_and_following"
        ? seriesScopeRaw
        : undefined,
    customerPackageId: isValidUuid(customerPackageRaw) ? customerPackageRaw : null,
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
