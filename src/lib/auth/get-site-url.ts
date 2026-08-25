import { headers } from "next/headers";

import {
  AppUrlConfigError,
  requireAppUrl,
  resolveAppUrlFromRequestHost,
  resolveConfiguredAppUrl,
  resolveDevLocalAppUrl,
} from "@/lib/env/resolve-app-url";

/**
 * URL base para links de e-mail Auth (convite, confirmação, recuperar senha).
 * Preferência: APP_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL → headers → localhost (só dev).
 */
export async function getSiteUrl(): Promise<string> {
  const configured = resolveConfiguredAppUrl();
  if (configured) {
    return configured;
  }

  try {
    const headerStore = await headers();
    const fromHeaders = resolveAppUrlFromRequestHost(
      headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
      headerStore.get("x-forwarded-proto"),
    );
    if (fromHeaders) {
      // Em produção, nunca aceite host local via header (proxy mal configurado / spoof).
      const isLocalHost =
        fromHeaders.includes("://localhost") || fromHeaders.includes("://127.0.0.1");
      if (!isLocalHost || resolveDevLocalAppUrl()) {
        return fromHeaders;
      }
    }
  } catch {
    // Fora de request (ex.: script) — segue para requireAppUrl.
  }

  return requireAppUrl();
}

export { AppUrlConfigError };
