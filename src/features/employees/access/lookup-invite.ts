"use server";

import { z } from "zod";

const inviteLookupEmailSchema = z
  .string({ error: "Informe o e-mail do convite." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail do convite.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

/**
 * Pré-cadastro de funcionário NÃO revela se o e-mail tem convite.
 * A existência do convite só é confirmada após autenticação em /convite.
 */
export type InviteLookupResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      error: string;
      email: string;
    };

export async function lookupPendingInviteByEmailAction(
  emailInput: string,
): Promise<InviteLookupResult> {
  const parsed = inviteLookupEmailSchema.safeParse(emailInput);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido.",
      email: emailInput.trim().toLowerCase(),
    };
  }

  return { ok: true, email: parsed.data };
}
