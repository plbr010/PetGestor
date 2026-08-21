import "server-only";

import { getSiteUrl } from "@/lib/auth/get-site-url";
import {
  BillingConfigError,
  isSupabaseServiceRoleConfigured,
} from "@/lib/env/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SendEmployeeInviteResult = {
  status: "sent" | "account_exists" | "config_missing" | "send_failed";
  /** Link Auth para o dono copiar/WhatsApp se o Gmail não entregar. */
  shareLink?: string;
};

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
  const shareHint = result.shareLink
    ? " Se o Gmail não chegar, copie o link de convite abaixo e envie no WhatsApp."
    : "";

  switch (result.status) {
    case "sent":
      return `Convite criado e e-mail enviado para ${email}.${shareHint}`;
    case "account_exists":
      return `Convite da empresa atualizado. Este e-mail já tem conta confirmada no PetGestor — peça ao funcionário para entrar e abrir /convite.${shareHint}`;
    case "config_missing":
      return `Convite criado, mas o envio de e-mail não está configurado no servidor (SUPABASE_SERVICE_ROLE_KEY).${shareHint || " Peça ao funcionário para abrir /cadastro → “Sou funcionário”."}`;
    case "send_failed":
      return `Convite criado, mas o Gmail pode não ter recebido o e-mail automático.${shareHint || ` Peça para usar /cadastro → “Sou funcionário” com ${email}.`}`;
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

async function resolveInviteRedirectTo(): Promise<string> {
  const siteUrl = await getSiteUrl();
  return `${siteUrl}/auth/confirm?next=${encodeURIComponent("/convite")}`;
}

async function generateShareLink(
  email: string,
  redirectTo: string,
): Promise<string | undefined> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: inviteOptions(redirectTo),
    });

    if (error) {
      return undefined;
    }

    const link = data.properties?.action_link;
    return typeof link === "string" && link.length > 0 ? link : undefined;
  } catch {
    return undefined;
  }
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
    const redirectTo = await resolveInviteRedirectTo();
    const options = inviteOptions(redirectTo);

    const first = await admin.auth.admin.inviteUserByEmail(email, options);

    if (!first.error) {
      const shareLink = await generateShareLink(email, redirectTo);
      return { status: "sent", shareLink };
    }

    if (!isAlreadyRegisteredAuthError(first.error.message ?? "")) {
      const shareLink = await generateShareLink(email, redirectTo);
      return { status: "send_failed", shareLink };
    }

    // Reenvio: se a conta Auth existe mas ainda não confirmou, recria o convite.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options,
    });

    if (linkError || !linkData?.user) {
      return {
        status: "account_exists",
        shareLink: linkData?.properties?.action_link,
      };
    }

    const existing = linkData.user;
    const confirmed = Boolean(existing.email_confirmed_at);
    const shareFromGenerate =
      typeof linkData.properties?.action_link === "string"
        ? linkData.properties.action_link
        : undefined;

    if (existing.id && !confirmed) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);

      if (deleteError) {
        return { status: "send_failed", shareLink: shareFromGenerate };
      }

      const retry = await admin.auth.admin.inviteUserByEmail(email, options);

      if (!retry.error) {
        const shareLink = (await generateShareLink(email, redirectTo)) ?? shareFromGenerate;
        return { status: "sent", shareLink };
      }

      const shareLink = (await generateShareLink(email, redirectTo)) ?? shareFromGenerate;
      return { status: "send_failed", shareLink };
    }

    return { status: "account_exists", shareLink: shareFromGenerate };
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return { status: "config_missing" };
    }

    return { status: "send_failed" };
  }
}
