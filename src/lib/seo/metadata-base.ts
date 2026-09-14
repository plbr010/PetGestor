import { resolveConfiguredAppUrl } from "@/lib/env/resolve-app-url";

/** Fallback só para build/dev local. Não inventa domínio de produção. */
export const DEV_METADATA_BASE_URL = "http://localhost:3000";

export function getMetadataBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveConfiguredAppUrl(env) ?? DEV_METADATA_BASE_URL;
}

export function getMetadataBase(
  env: Record<string, string | undefined> = process.env,
): URL {
  return new URL(getMetadataBaseUrl(env));
}
