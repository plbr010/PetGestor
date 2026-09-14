import {
  requireAppUrl,
  resolveConfiguredAppUrl,
  resolveDevLocalAppUrl,
} from "@/lib/env/resolve-app-url";

type EnvLike = Record<string, string | undefined>;

/**
 * URL absoluta para metadata/canonical/sitemap.
 * Reutiliza a política canônica de `resolve-app-url` — sem segundo fallback.
 *
 * - development/test sem env → localhost permitido
 * - production sem APP_URL/NEXT_PUBLIC_APP_URL/VERCEL_URL → undefined (fail-closed)
 */
export function tryGetMetadataBaseUrl(env: EnvLike = process.env): string | undefined {
  return resolveConfiguredAppUrl(env) ?? resolveDevLocalAppUrl(env);
}

/** Igual a `requireAppUrl`: localhost só fora de production; senão lança. */
export function getMetadataBaseUrl(env: EnvLike = process.env): string {
  return requireAppUrl(env);
}

export function getMetadataBase(env: EnvLike = process.env): URL | undefined {
  const url = tryGetMetadataBaseUrl(env);
  return url ? new URL(url) : undefined;
}
