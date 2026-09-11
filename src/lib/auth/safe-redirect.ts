const DEFAULT_REDIRECT = "/dashboard";

function containsUnsafeRedirectToken(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("://") ||
    lower.includes("\\") ||
    lower.includes("%2f%2f") ||
    lower.includes("%5c") ||
    lower.includes("javascript:") ||
    lower.includes("data:") ||
    /\s/.test(value)
  );
}

/**
 * Aceita apenas caminhos internos absolutos (ex.: `/dashboard`).
 * Bloqueia URLs externas, protocol-relative (`//`) e esquemas perigosos.
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!value) {
    return fallback;
  }

  let trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    trimmed = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  if (containsUnsafeRedirectToken(trimmed)) {
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
