const DEFAULT_REDIRECT = "/dashboard";

const ALLOWED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/convite",
  "/nova-senha",
  "/entrar",
  "/verifique-email",
  "/cadastro",
  "/recuperar-senha",
  "/auth/erro",
] as const;

function isAllowedInternalPath(pathWithQuery: string): boolean {
  const pathOnly = pathWithQuery.split("?")[0]?.split("#")[0] ?? "";
  return ALLOWED_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`));
}

/**
 * Aceita apenas caminhos internos da allowlist (ex.: `/dashboard`).
 * Bloqueia URLs externas, protocol-relative, javascript: e path traversal.
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

  if (trimmed.includes("://") || trimmed.includes("\\") || trimmed.includes("\0")) {
    return fallback;
  }

  if (/[\s<>'"`]/.test(trimmed)) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (
      decoded.startsWith("//") ||
      decoded.includes("://") ||
      decoded.includes("\\") ||
      /javascript:/i.test(decoded) ||
      decoded.includes("..")
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  if (!isAllowedInternalPath(trimmed)) {
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
