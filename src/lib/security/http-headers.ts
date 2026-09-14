/**
 * Headers HTTP de segurança do app.
 *
 * CSP completa (script-src, connect-src, img-src, etc.) NÃO entra neste PR:
 * Next.js, Meta Pixel, Supabase Auth, Mercado Pago e imagens exigiriam uma
 * allowlist testada em produção. Aplicamos só diretivas comprovadamente
 * seguras — em especial clickjacking via frame-ancestors.
 */

export type SecurityHeader = {
  key: string;
  value: string;
};

export const FRAME_ANCESTORS_CSP = "frame-ancestors 'none'";

const BASE_SECURITY_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: FRAME_ANCESTORS_CSP },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

export const HSTS_HEADER: SecurityHeader = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
};

export function shouldEnableHsts(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}

export function buildSecurityHeaderList(options: {
  enableHsts: boolean;
}): SecurityHeader[] {
  if (options.enableHsts) {
    return [...BASE_SECURITY_HEADERS, HSTS_HEADER];
  }
  return [...BASE_SECURITY_HEADERS];
}

export const TECHNICAL_AUTH_ROBOTS_HEADER: SecurityHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
};

export function buildNextSecurityHeaders(options: { enableHsts: boolean }): Array<{
  source: string;
  headers: SecurityHeader[];
}> {
  const headers = buildSecurityHeaderList(options);
  // `/:path*` cobre `/` no Next.js (ao contrário de `/(.*)`). Uma única regra
  // evita headers duplicados na raiz.
  return [
    { source: "/:path*", headers },
    { source: "/auth/:path*", headers: [TECHNICAL_AUTH_ROBOTS_HEADER] },
  ];
}
