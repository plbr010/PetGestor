/**
 * Allowlist server-side do proprietário da plataforma.
 * NÃO usar em Client Components — apenas gates server-side.
 *
 * Contas listadas aqui têm:
 * - acesso ao painel /admin
 * - liberação do gate de assinatura/trial (somente essas contas)
 */
export const PLATFORM_ADMIN_EMAILS = ["plbrpc@gmail.com"] as const;

export function isAllowlistedPlatformAdminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return PLATFORM_ADMIN_EMAILS.some((allowed) => allowed === normalized);
}
