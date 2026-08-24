import "server-only";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/** Em Vercel ou NODE_ENV=production, não usar localhost como origem da app. */
export function shouldAvoidLocalhostAppUrl(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

/**
 * Origem pública da app a partir de env (sem headers da request).
 * Ordem: APP_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL (https).
 * Ignora valores localhost quando deploy/produção.
 */
export function resolveConfiguredAppUrl(): string | undefined {
  const avoidLocalhost = shouldAvoidLocalhostAppUrl();
  const candidates = [
    readOptionalEnv(process.env.APP_URL),
    readOptionalEnv(process.env.NEXT_PUBLIC_APP_URL),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = stripTrailingSlash(candidate);
    if (avoidLocalhost && isLocalhostUrl(normalized)) {
      continue;
    }

    return normalized;
  }

  const vercelUrl = readOptionalEnv(process.env.VERCEL_URL);
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (host.length > 0) {
      return `https://${host}`;
    }
  }

  return undefined;
}

/** Origem da app para redirects de auth, billing e e-mails. */
export function getAppUrl(): string {
  return resolveConfiguredAppUrl() ?? "http://localhost:3000";
}
