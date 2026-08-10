const DEFAULT_REDIRECT = "/dashboard";

/**
 * Aceita apenas caminhos internos absolutos (ex.: `/dashboard`).
 * Bloqueia URLs externas e protocol-relative (`//`).
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed.includes("://")) {
    return fallback;
  }

  if (trimmed.includes("\\")) {
    return fallback;
  }

  return trimmed;
}

export function isSafeRedirectPath(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return getSafeRedirectPath(value, "__invalid__") !== "__invalid__";
}
