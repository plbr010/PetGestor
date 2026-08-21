"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const inviteLookupEmailSchema = z
  .string({ error: "Informe o e-mail do convite." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail do convite.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

export type InviteLookupResult =
  | {
      found: true;
      companyName: string;
      accessProfile: string;
      expiresAt: string;
      email: string;
    }
  | {
      found: false;
      reason: string;
      email: string;
    };

export async function lookupPendingInviteByEmailAction(
  emailInput: string,
): Promise<InviteLookupResult> {
  const parsed = inviteLookupEmailSchema.safeParse(emailInput);

  if (!parsed.success) {
    return {
      found: false,
      reason: "invalid_email",
      email: emailInput.trim().toLowerCase(),
    };
  }

  const email = parsed.data;
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("lookup_pending_invite_by_email", {
      p_email: email,
    });

    if (error) {
      if (
        error.message?.includes("lookup_pending_invite_by_email") ||
        error.code === "PGRST202" ||
        error.code === "42883"
      ) {
        return { found: false, reason: "rpc_unavailable", email };
      }

      console.error("[invite:lookup]", error.message);
      return { found: false, reason: "rpc_error", email };
    }

    const result = data as Record<string, unknown> | null;

    if (!result || result.found !== true) {
      return {
        found: false,
        reason: (result?.reason as string) ?? "no_pending_invite",
        email,
      };
    }

    return {
      found: true,
      companyName: (result.company_name as string) ?? "",
      accessProfile: (result.access_profile as string) ?? "",
      expiresAt: (result.expires_at as string) ?? "",
      email,
    };
  } catch {
    return { found: false, reason: "exception", email };
  }
}
