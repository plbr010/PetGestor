import { z } from "zod";

import {
  ATTACHMENT_PHASES,
  PET_ATTACHMENT_CATEGORIES,
  SERVICE_ORDER_ATTACHMENT_CATEGORIES,
} from "@/features/attachments/constants";

const uuidField = z.string({ error: "Dados inválidos." }).uuid("Dados inválidos.");

const descriptionField = z
  .string({ error: "Descrição inválida." })
  .trim()
  .max(500, "A descrição deve ter no máximo 500 caracteres.")
  .nullable()
  .optional();

export const petAttachmentUploadSchema = z.object({
  petId: uuidField,
  category: z.enum(PET_ATTACHMENT_CATEGORIES, {
    error: "Selecione uma categoria válida.",
  }),
  description: descriptionField,
});

export const serviceOrderAttachmentUploadSchema = z.object({
  serviceOrderId: uuidField,
  category: z.enum(SERVICE_ORDER_ATTACHMENT_CATEGORIES, {
    error: "Selecione uma categoria válida.",
  }),
  phase: z
    .enum(ATTACHMENT_PHASES, { error: "Informe se a foto é de antes ou depois." })
    .nullable(),
  description: descriptionField,
});

export const petPhotoUploadSchema = z.object({
  petId: uuidField,
});

function optionalDescription(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parsePetAttachmentUploadForm(formData: FormData) {
  return petAttachmentUploadSchema.safeParse({
    petId: formData.get("petId"),
    category: formData.get("category"),
    description: optionalDescription(formData.get("description")),
  });
}

export function parseServiceOrderAttachmentUploadForm(formData: FormData) {
  const phaseRaw = formData.get("phase");
  return serviceOrderAttachmentUploadSchema.safeParse({
    serviceOrderId: formData.get("serviceOrderId"),
    category: formData.get("category"),
    phase: phaseRaw === "" || phaseRaw == null ? null : phaseRaw,
    description: optionalDescription(formData.get("description")),
  });
}

export function parsePetPhotoUploadForm(formData: FormData) {
  return petPhotoUploadSchema.safeParse({
    petId: formData.get("petId"),
  });
}
