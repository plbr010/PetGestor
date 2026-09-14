/**
 * Classifica erros do GoTrue/Auth para recovery e reenvio de confirmação.
 *
 * Não mascarar pane real (SMTP, 5xx, rate limit do provider) como sucesso.
 * Erros que revelariam se o e-mail existe devem usar a mensagem genérica anti-enumeração.
 */

export type AuthProviderErrorLike = {
  status?: number | null;
  code?: string | null;
  message?: string | null;
};

const ANTI_ENUMERATION_CODES = new Set([
  "user_not_found",
  "email_not_found",
  "email_address_invalid",
  "invalid_email",
  "validation_failed",
]);

const OUTAGE_CODES = new Set([
  "unexpected_failure",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "smtp_error",
  "request_timeout",
]);

function readCode(error: AuthProviderErrorLike): string {
  return (error.code ?? "").trim().toLowerCase();
}

function readMessage(error: AuthProviderErrorLike): string {
  return (error.message ?? "").trim().toLowerCase();
}

export function isAuthOutageError(error: AuthProviderErrorLike): boolean {
  const status = error.status ?? 0;
  if (status >= 500) {
    return true;
  }

  const code = readCode(error);
  if (OUTAGE_CODES.has(code)) {
    return true;
  }

  const message = readMessage(error);
  return (
    message.includes("smtp") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("temporarily unavailable")
  );
}

/**
 * Erros do provider que, se mostrados como “indisponível” só para alguns e-mails,
 * permitiriam enumerar contas. Redirect URL inválida / 5xx / SMTP não entram aqui.
 */
export function isAntiEnumerationAuthError(error: AuthProviderErrorLike): boolean {
  if (isAuthOutageError(error)) {
    return false;
  }

  const message = readMessage(error);
  if (
    message.includes("redirect") ||
    message.includes("not allowed") ||
    message.includes("whitelist") ||
    message.includes("allow list") ||
    message.includes("allowlist")
  ) {
    return false;
  }

  const code = readCode(error);
  if (ANTI_ENUMERATION_CODES.has(code)) {
    return true;
  }

  const status = error.status ?? 0;
  if (status === 404) {
    return true;
  }

  if (
    message.includes("user not found") ||
    message.includes("email not found") ||
    message.includes("unable to find user") ||
    message.includes("user does not exist") ||
    message.includes("invalid email") ||
    message.includes("email_address_invalid") ||
    message.includes("unable to validate email")
  ) {
    return true;
  }

  if ((status === 400 || status === 422) && (message.includes("email") || message.includes("user"))) {
    return true;
  }

  return false;
}
