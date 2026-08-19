"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InviteAcceptResult =
  | {
      accepted: true;
      companyId: string;
      companyName: string;
      employeeId: string;
      accessProfile: string;
    }
  | {
      accepted: false;
      reason: string;
    };

/**
 * Tenta aceitar um convite pendente para o usuário logado.
 * Chamada após login/cadastro — se não houver convite, retorna accepted=false.
 */
export async function tryAcceptPendingInvite(): Promise<InviteAcceptResult> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("accept_pending_invite");

    if (error) {
      console.error("[invite:accept]", error.message);
      return { accepted: false, reason: "rpc_error" };
    }

    const result = data as Record<string, unknown> | null;

    if (!result || result.accepted !== true) {
      return {
        accepted: false,
        reason: (result?.reason as string) ?? "unknown",
      };
    }

    return {
      accepted: true,
      companyId: result.company_id as string,
      companyName: result.company_name as string,
      employeeId: result.employee_id as string,
      accessProfile: result.access_profile as string,
    };
  } catch {
    return { accepted: false, reason: "exception" };
  }
}
