import { z } from "zod";

import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  parseBRLToCents,
  isValidDurationMinutes,
  isValidPriceCents,
} from "@/lib/money";
import type { PetSize, ServicePricingMode } from "@/types/database.types";
import {
  parseDurationInput,
  parsePriceInput,
  parseSizePricesFromForm,
  PET_SIZES,
} from "@/features/services/utils";
import type { ServiceSizePriceInput } from "@/features/services/types";

const optionalDescription = z
  .string()
  .trim()
  .max(2000, "Descrição muito longa.")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const pricingModeSchema = z.enum(["fixed", "by_size"] satisfies ServicePricingMode[]);

const sizePriceSchema = z.object({
  size: z.enum(PET_SIZES satisfies PetSize[]),
  priceCents: z
    .number()
    .int()
    .refine(isValidPriceCents, { message: "Informe um preço válido." }),
  durationMinutes: z
    .number()
    .int()
    .refine(isValidDurationMinutes, {
      message: `A duração deve ficar entre ${MIN_DURATION_MINUTES} e ${MAX_DURATION_MINUTES} minutos.`,
    }),
});

export const serviceFormSchema = z
  .object({
    name: z
      .string({ error: "Informe o nome do serviço." })
      .trim()
      .min(2, "O nome deve ter pelo menos 2 caracteres.")
      .max(120, "Nome muito longo."),
    description: optionalDescription,
    pricingMode: pricingModeSchema,
    active: z.boolean(),
    priceCents: z.number().int().nullable(),
    durationMinutes: z.number().int().nullable(),
    sizePrices: z.array(sizePriceSchema).nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.pricingMode === "fixed") {
      if (data.priceCents === null || !isValidPriceCents(data.priceCents)) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um preço válido.",
          path: ["priceCents"],
        });
      }

      if (data.durationMinutes === null || !isValidDurationMinutes(data.durationMinutes)) {
        ctx.addIssue({
          code: "custom",
          message: `Informe uma duração entre ${MIN_DURATION_MINUTES} e ${MAX_DURATION_MINUTES} minutos.`,
          path: ["durationMinutes"],
        });
      }

      return;
    }

    if (!data.sizePrices || data.sizePrices.length !== PET_SIZES.length) {
      ctx.addIssue({
        code: "custom",
        message: "Informe preço e duração para todos os portes.",
        path: ["sizePrices"],
      });
      return;
    }

    const sizes = new Set(data.sizePrices.map((row) => row.size));

    for (const size of PET_SIZES) {
      if (!sizes.has(size)) {
        ctx.addIssue({
          code: "custom",
          message: "Informe preço e duração para todos os portes.",
          path: ["sizePrices"],
        });
        break;
      }
    }
  });

export type ServiceFormInput = z.infer<typeof serviceFormSchema>;

export function parseServiceForm(formData: FormData) {
  const pricingMode = formData.get("pricingMode");
  const activeRaw = formData.get("active");

  const parsedPricingMode =
    pricingMode === "fixed" || pricingMode === "by_size" ? pricingMode : null;

  if (!parsedPricingMode) {
    return serviceFormSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      pricingMode: "fixed",
      active: true,
      priceCents: null,
      durationMinutes: null,
      sizePrices: null,
    });
  }

  let priceCents: number | null = null;
  let durationMinutes: number | null = null;
  let sizePrices: ServiceSizePriceInput[] | null = null;

  if (parsedPricingMode === "fixed") {
    priceCents = parsePriceInput(formData.get("price"));
    durationMinutes = parseDurationInput(formData.get("durationMinutes"));
  } else {
    sizePrices = parseSizePricesFromForm(formData);
  }

  return serviceFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    pricingMode: parsedPricingMode,
    active: activeRaw === "on" || activeRaw === "true" || activeRaw === "1",
    priceCents,
    durationMinutes,
    sizePrices,
  });
}

export function parseBRLField(value: string): number | null {
  return parseBRLToCents(value);
}
