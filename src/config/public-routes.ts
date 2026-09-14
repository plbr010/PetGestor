/** Rotas e âncoras públicas — landing, auth e conversão. */
export const MAIN_CONTENT_ID = "conteudo-principal";

export const publicPaths = {
  home: "/",
  login: "/entrar",
  signup: "/cadastro",
  demo: "/#demonstracao",
  features: "/#recursos",
  howItWorks: "/#como-funciona",
  pricing: "/#precos",
} as const;

export type PublicPath = (typeof publicPaths)[keyof typeof publicPaths];

/** Prefixos que nunca devem ser usados como “demonstração” pública. */
export const protectedPathPrefixes = [
  "/dashboard",
  "/admin",
  "/assinatura",
  "/assinatura-equipe",
  "/onboarding",
  "/notificacoes",
] as const;

export function isProtectedAppPath(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? href;
  return protectedPathPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
