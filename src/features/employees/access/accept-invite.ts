"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mapInviteAcceptReason } from "@/features/employees/access/invite-messages";
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

export type PendingInvitePeek =
  | {
      found: true;
      inviteId: string;
      companyId: string;
      companyName: string;
      employeeId: string;
      accessProfile: string;
      expiresAt: string;
    }
  | {
      found: false;
      reason: string;
    };

function mapAcceptResult(data: Record<string, unknown> | null): InviteAcceptResult {
  if (!data || data.accepted !== true) {
    return {
      accepted: false,
      reason: (data?.reason as string) ?? "unknown",
    };
  }

  return {
    accepted: true,
    companyId: data.company_id as string,
    companyName: data.company_name as string,
    employeeId: data.employee_id as string,
    accessProfile: data.access_profile as string,
  };
}

/**
 * Lê convite pendente do usuário logado sem aceitar.
 */
export async function peekPendingInvite(): Promise<PendingInvitePeek> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("peek_pending_invite");

    if (error) {
      if (
        error.message?.includes("peek_pending_invite") ||
        error.code === "PGRST202" ||
        error.code === "42883"
      ) {
        return { found: false, reason: "rpc_unavailable" };
      }

      console.error("[invite:peek]", error.message);
      return { found: false, reason: "rpc_error" };
    }

    const result = data as Record<string, unknown> | null;

    if (!result || result.found !== true) {
      return {
        found: false,
        reason: (result?.reason as string) ?? "no_pending_invite",
      };
    }

    return {
      found: true,
      inviteId: result.invite_id as string,
      companyId: result.company_id as string,
      companyName: (result.company_name as string) ?? "",
      employeeId: result.employee_id as string,
      accessProfile: result.access_profile as string,
      expiresAt: result.expires_at as string,
    };
  } catch {
    return { found: false, reason: "exception" };
  }
}

/**
 * Aceita convite pendente para o usuário logado.
 */
export async function tryAcceptPendingInvite(): Promise<InviteAcceptResult> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("accept_pending_invite");

    if (error) {
      console.error("[invite:accept]", error.message);
      return { accepted: false, reason: "rpc_error" };
    }

    return mapAcceptResult(data as Record<string, unknown> | null);
  } catch {
    return { accepted: false, reason: "exception" };
  }
}

export type AcceptInviteActionState = {
  error?: string;
  success?: string;
};

/**
 * Server action: aceitar convite e ir ao dashboard.
 */
export async function acceptPendingInviteAction(
  // useActionState exige assinatura (prevState) => nextState
  prevState: AcceptInviteActionState,
): Promise<AcceptInviteActionState> {
  void prevState;
  const result = await tryAcceptPendingInvite();

  if (!result.accepted) {
    return { error: mapInviteAcceptReason(result.reason) };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard?convite-aceito=1`);
}

/**
 * Resolve caminho pós-login/cadastro com convite explícito.
 */
export async function resolveAuthLandingPath(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    return "/entrar";
  }

  const pending = await peekPendingInvite();

  if (pending.found) {
    return "/convite";
  }

  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", data.claims.sub)
    .is("access_revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membership) {
    return "/dashboard";
  }

  const { data: anyMembership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", data.claims.sub)
    .limit(1)
    .maybeSingle();

  return anyMembership ? "/dashboard" : "/onboarding";
}
