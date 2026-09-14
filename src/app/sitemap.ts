import type { MetadataRoute } from "next";

import { publicPaths } from "@/config/public-routes";
import { tryGetMetadataBaseUrl } from "@/lib/seo/metadata-base";
import { sitemapPublicPathnames } from "@/lib/seo/robots-policy";

export function buildSitemap(
  env: Record<string, string | undefined> = process.env,
): MetadataRoute.Sitemap {
  const base = tryGetMetadataBaseUrl(env);
  if (!base) {
    return [];
  }

  return sitemapPublicPathnames.map((pathname, index) => ({
    url: pathname === publicPaths.home ? base : `${base}${pathname}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.8,
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}
