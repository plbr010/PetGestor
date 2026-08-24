import { headers } from "next/headers";

import {
  getAppUrl,
  isLocalhostUrl,
  resolveConfiguredAppUrl,
  shouldAvoidLocalhostAppUrl,
} from "@/lib/env/app-url";

/**
 * Origem usada em emailRedirectTo / redirectTo do Supabase Auth.
 * Preferência: APP_URL → NEXT_PUBLIC_APP_URL → VERCEL_URL → Host da request → localhost (só dev).
 */
export async function getSiteUrl(): Promise<string> {
  const configured = resolveConfiguredAppUrl();
  if (configured) {
    return configured;
  }

  try {
    const headerStore = await headers();
    const host =
      headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? undefined;

    if (host) {
      const isLocalHost =
        host.startsWith("localhost") ||
        host.startsWith("127.0.0.1") ||
        host.startsWith("[::1]");

      if (!(shouldAvoidLocalhostAppUrl() && isLocalHost)) {
        const protocol =
          headerStore.get("x-forwarded-proto") ?? (isLocalHost ? "http" : "https");
        const fromHeaders = `${protocol}://${host}`.replace(/\/$/, "");

        if (!(shouldAvoidLocalhostAppUrl() && isLocalhostUrl(fromHeaders))) {
          return fromHeaders;
        }
      }
    }
  } catch {
    // Fora de request (ex.: scripts) — cai no fallback.
  }

  return getAppUrl();
}
