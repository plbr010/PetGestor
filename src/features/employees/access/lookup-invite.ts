"use server";

import { z } from "zod";

import { AUTH_FIELD_LIMITS } from "@/features/auth/schemas";
import { enforceAuthRateLimit } from "@/lib/security/rate-limit";
import { firstIssueMessage } from "@/lib/validation/first-issue-message";

const inviteLookupEmailSchema = z
  .string({ error: "Informe o e-mail do convite." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail do convite.")
  .max(AUTH_FIELD_LIMITS.email, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

/**
 * Resultado público do pré-cadastro.
 * Nunca revela se o e-mail tem convite, conta ou empresa.
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
      error: firstIssueMessage(parsed.error.issues, "Informe um e-mail válido."),
      email: emailInput.trim().toLowerCase(),
    };
  }

  const email = parsed.data;
  const limited = await enforceAuthRateLimit({
    action: "invite_lookup",
    email,
  });

  if (!limited.ok) {
    return { ok: false, error: limited.error, email };
  }

  return { ok: true, email };
}
