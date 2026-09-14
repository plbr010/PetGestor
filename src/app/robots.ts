import type { MetadataRoute } from "next";

import { getMetadataBaseUrl } from "@/lib/seo/metadata-base";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
        "/notificacoes",
      ],
    },
    sitemap: `${getMetadataBaseUrl()}/sitemap.xml`,
  };
}
