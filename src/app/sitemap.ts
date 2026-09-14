import type { MetadataRoute } from "next";

import { publicPaths } from "@/config/public-routes";
import { getMetadataBaseUrl } from "@/lib/seo/metadata-base";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getMetadataBaseUrl();

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}${publicPaths.signup}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}${publicPaths.login}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
