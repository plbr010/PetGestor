import type { Metadata } from "next";

/**
 * Política explícita de indexação (não herdar o RootLayout por acaso).
 *
 * - `/` (landing): indexável — página pública de produto.
 * - `/cadastro`: indexável — decisão de conversão (CTA “teste grátis”).
 * - `/entrar`: NÃO indexável — login não é destino de busca; `follow` para
 *   preservar links da landing. Fora do sitemap. Sem Disallow no robots.txt,
 *   para o crawler conseguir ler a tag noindex.
 * - Rotas técnicas de auth (recuperar/nova senha, convite, onboarding,
 *   verifique-email, `/auth/*`): noindex, nofollow.
 */
export const publicIndexRobots = {
  index: true,
  follow: true,
} as const satisfies NonNullable<Metadata["robots"]>;

export const loginRobots = {
  index: false,
  follow: true,
} as const satisfies NonNullable<Metadata["robots"]>;

export const technicalAuthRobots = {
  index: false,
  follow: false,
} as const satisfies NonNullable<Metadata["robots"]>;

/** Únicas rotas que o sitemap público deve anunciar. */
export const sitemapPublicPathnames = ["/", "/cadastro"] as const;
