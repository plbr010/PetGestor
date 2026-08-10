import { z } from "zod";

import { isFutureDate } from "@/lib/pet-display";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

export const petSpeciesSchema = z.enum(["dog", "cat", "other"], {
  error: "Selecione a espécie.",
});

export const petSexSchema = z.enum(["male", "female", "unknown"], {
  error: "Selecione o sexo.",
});

export const petFormSchema = z
  .object({
    name: z
      .string({ error: "Informe o nome do pet." })
      .trim()
      .min(1, "Informe o nome do pet.")
      .max(120, "Nome muito longo."),
    customerId: z.uuid("Selecione um tutor válido."),
    species: petSpeciesSchema,
    breed: optionalText(120, "Raça muito longa."),
    sex: petSexSchema.default("unknown"),
    birthDate: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .nullable(),
    weightKg: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value.replace(",", ".")))
      .nullable(),
    color: optionalText(120, "Cor muito longa."),
    allergies: optionalText(2000, "Alergias muito longas."),
    notes: optionalText(2000, "Observações muito longas."),
  })
  .superRefine((data, ctx) => {
    if (data.birthDate && isFutureDate(data.birthDate)) {
      ctx.addIssue({
        code: "custom",
        message: "A data de nascimento não pode estar no futuro.",
        path: ["birthDate"],
      });
    }

    if (data.weightKg !== null) {
      const weight = Number(data.weightKg);

      if (!Number.isFinite(weight) || weight <= 0 || weight > 200) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um peso válido entre 0,01 e 200 kg.",
          path: ["weightKg"],
        });
      }
    }
  });

export type PetFormInput = z.infer<typeof petFormSchema>;

export function parsePetForm(formData: FormData) {
  return petFormSchema.safeParse({
    name: formData.get("name"),
    customerId: formData.get("customerId"),
    species: formData.get("species"),
    breed: formData.get("breed"),
    sex: formData.get("sex") || "unknown",
    birthDate: formData.get("birthDate"),
    weightKg: formData.get("weightKg"),
    color: formData.get("color"),
    allergies: formData.get("allergies"),
    notes: formData.get("notes"),
  });
}

export function petFormToDbPayload(input: PetFormInput) {
  return {
    customer_id: input.customerId,
    name: input.name,
    species: input.species,
    breed: input.breed,
    sex: input.sex,
    birth_date: input.birthDate,
    weight_kg: input.weightKg === null ? null : Number(input.weightKg),
    color: input.color,
    allergies: input.allergies,
    notes: input.notes,
  };
}
