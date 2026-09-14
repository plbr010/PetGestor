import type { MetadataRoute } from "next";

import { tryGetMetadataBaseUrl } from "@/lib/seo/metadata-base";

const DISALLOWED_PATHS = [
  "/dashboard",
  "/admin",
  "/assinatura",
  "/assinatura-equipe",
  "/onboarding",
  "/api/",
  "/auth/",
  "/convite",
  "/nova-senha",
  "/recuperar-senha",
  "/verifique-email",
  "/notificacoes",
];

export function buildRobots(
  env: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
  const base = tryGetMetadataBaseUrl(env);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /cadastro permanece rastreável (conversão). /entrar não entra no
      // Disallow para o crawler conseguir ler o noindex da página.
      disallow: DISALLOWED_PATHS,
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
