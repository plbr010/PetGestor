import "server-only";

import { getSiteUrl } from "@/lib/auth/get-site-url";
import {
  BillingConfigError,
  isSupabaseServiceRoleConfigured,
} from "@/lib/env/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SendEmployeeInviteResult =
  | { status: "sent" }
  | { status: "account_exists" }
  | { status: "config_missing" }
  | { status: "send_failed" };

export function isAlreadyRegisteredAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("user already registered") ||
    normalized.includes("email address already") ||
    normalized.includes("email_exists")
  );
}

export function mapSendEmployeeInviteMessage(
  result: SendEmployeeInviteResult,
  email: string,
): string {
  switch (result.status) {
    case "sent":
      return `Convite criado e e-mail enviado para ${email}. Peça ao funcionário para abrir o link (verifique spam), definir a senha e aceitar o acesso.`;
    case "account_exists":
      return `Convite da empresa atualizado. Este e-mail já tem conta no PetGestor — peça ao funcionário para entrar e abrir /convite.`;
    case "config_missing":
      return `Convite criado, mas o envio de e-mail não está configurado no servidor. Peça ao funcionário para abrir /cadastro, escolher “Sou funcionário” e usar ${email}.`;
    case "send_failed":
      return `Convite criado, mas não foi possível enviar o e-mail agora. Peça ao funcionário para usar /cadastro → “Sou funcionário” com ${email}, ou tente novamente em alguns minutos.`;
  }
}

function inviteOptions(redirectTo: string) {
  return {
    redirectTo,
    data: {
      signup_mode: "staff",
      invited_via: "employee_access",
    },
  };
}

/**
 * Envia o e-mail de convite Auth do Supabase para o funcionário.
 * O vínculo com a empresa já deve existir em `company_member_invites`.
 */
export async function sendEmployeeInviteEmail(
  email: string,
): Promise<SendEmployeeInviteResult> {
  if (!isSupabaseServiceRoleConfigured()) {
    return { status: "config_missing" };
  }

  try {
    const admin = createSupabaseAdminClient();
    const siteUrl = await getSiteUrl();
    const redirectTo = `${siteUrl}/auth/confirm?next=${encodeURIComponent("/convite")}`;
    const options = inviteOptions(redirectTo);

    const first = await admin.auth.admin.inviteUserByEmail(email, options);

    if (!first.error) {
      return { status: "sent" };
    }

    if (!isAlreadyRegisteredAuthError(first.error.message ?? "")) {
      return { status: "send_failed" };
    }

    // Reenvio: se a conta Auth existe mas ainda não confirmou, recria o convite.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options,
    });

    if (linkError || !linkData?.user) {
      return { status: "account_exists" };
    }

    const existing = linkData.user;
    const confirmed = Boolean(existing.email_confirmed_at);

    if (existing.id && !confirmed) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);

      if (deleteError) {
        return { status: "send_failed" };
      }

      const retry = await admin.auth.admin.inviteUserByEmail(email, options);

      if (!retry.error) {
        return { status: "sent" };
      }

      return { status: "send_failed" };
    }

    return { status: "account_exists" };
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return { status: "config_missing" };
    }

    return { status: "send_failed" };
  }
}
