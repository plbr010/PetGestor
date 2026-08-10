import { z } from "zod";

export const checkInSchema = z.object({
  intakeNotes: z
    .string()
    .trim()
    .max(3000, "Observações de entrada muito longas.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export const serviceOrderNotesSchema = z.object({
  intakeNotes: z
    .string()
    .trim()
    .max(3000, "Observações de entrada muito longas.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
  internalNotes: z
    .string()
    .trim()
    .max(5000, "Observações internas muito longas.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
  completionNotes: z
    .string()
    .trim()
    .max(3000, "Observações de finalização muito longas.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export const completeServiceOrderSchema = z.object({
  completionNotes: z
    .string()
    .trim()
    .max(3000, "Observações de finalização muito longas.")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export function parseCheckInForm(formData: FormData) {
  return checkInSchema.safeParse({
    intakeNotes: formData.get("intakeNotes"),
  });
}

export function parseServiceOrderNotesForm(formData: FormData) {
  return serviceOrderNotesSchema.safeParse({
    intakeNotes: formData.get("intakeNotes"),
    internalNotes: formData.get("internalNotes"),
    completionNotes: formData.get("completionNotes"),
  });
}

export function parseCompleteServiceOrderForm(formData: FormData) {
  return completeServiceOrderSchema.safeParse({
    completionNotes: formData.get("completionNotes"),
  });
}
