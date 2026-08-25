/**
 * Resolução central da URL pública do app (e-mails Auth, redirects, billing).
 *
 * Ordem:
 * 1. APP_URL
 * 2. NEXT_PUBLIC_APP_URL
 * 3. VERCEL_URL (https://…, injetada pela Vercel)
 * 4. (só getSiteUrl) headers x-forwarded-host / host
 * 5. http://localhost:3000 — apenas fora de produção
 */

export class AppUrlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlConfigError";
  }
}

export function normalizeAppUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** URL configurada por env / Vercel, sem headers de request. */
export function resolveConfiguredAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromAppUrl = env.APP_URL?.trim();
  if (fromAppUrl) {
    return normalizeAppUrl(fromAppUrl);
  }

  const fromPublic = env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromPublic) {
    return normalizeAppUrl(fromPublic);
  }

  const vercelHost = env.VERCEL_URL?.trim();
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host.length > 0) {
      return normalizeAppUrl(`https://${host}`);
    }
  }

  return undefined;
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/** Fallback local só em desenvolvimento / preview sem env. Nunca em production. */
export function resolveDevLocalAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (isProductionRuntime(env)) {
    return undefined;
  }
  return "http://localhost:3000";
}

export function requireAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = resolveConfiguredAppUrl(env);
  if (configured) {
    return configured;
  }

  const local = resolveDevLocalAppUrl(env);
  if (local) {
    return local;
  }

  throw new AppUrlConfigError(
    "URL do app não configurada. Defina APP_URL (ou NEXT_PUBLIC_APP_URL) na Vercel com a URL HTTPS de produção.",
  );
}

export function resolveAppUrlFromRequestHost(
  host: string | null | undefined,
  proto: string | null | undefined,
): string | undefined {
  const trimmedHost = host?.split(",")[0]?.trim();
  if (!trimmedHost) {
    return undefined;
  }

  const forwardedProto = proto?.split(",")[0]?.trim().toLowerCase();
  const isLocal =
    trimmedHost.startsWith("localhost") || trimmedHost.startsWith("127.0.0.1");
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isLocal
        ? "http"
        : "https";

  return normalizeAppUrl(`${protocol}://${trimmedHost}`);
}
