import { headers } from "next/headers";

function normalizeSiteUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/**
 * URL canônica do app para links de e-mail Auth (confirmação, reset, convite).
 * Em produção NUNCA deve retornar localhost — senão o Gmail abre "não pôde conectar".
 *
 * Preferência: APP_URL → NEXT_PUBLIC_APP_URL → headers da request → VERCEL_URL.
 */
export async function getSiteUrl(): Promise<string> {
  const fromAppUrl = process.env.APP_URL?.trim();
  const fromPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fromEnv = fromAppUrl || fromPublic;

  if (fromEnv) {
    const normalized = normalizeSiteUrl(fromEnv);

    if (isProductionRuntime() && isLocalhostUrl(normalized)) {
      console.error(
        "[auth:getSiteUrl] APP_URL/NEXT_PUBLIC_APP_URL aponta para localhost em produção. Configure a URL HTTPS da Vercel.",
      );
    } else {
      return normalized;
    }
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? undefined;
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";

  if (host && !isLocalhostUrl(`http://${host}`)) {
    return normalizeSiteUrl(`${protocol}://${host}`);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`;
    return normalizeSiteUrl(withProtocol);
  }

  if (isProductionRuntime()) {
    console.error(
      "[auth:getSiteUrl] Sem APP_URL/NEXT_PUBLIC_APP_URL em produção — links de e-mail podem apontar para localhost.",
    );
  }

  return "http://localhost:3000";
}

/** Exposto para testes — não usar em UI. */
export const __testables = {
  isLocalhostUrl,
  normalizeSiteUrl,
  isProductionRuntime,
};
