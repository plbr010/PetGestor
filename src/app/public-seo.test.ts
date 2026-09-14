import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildRobots } from "@/app/robots";
import { buildSitemap } from "@/app/sitemap";
import { brand } from "@/config/brand";
import { TRIAL_DURATION_DAYS } from "@/config/subscription";
import {
  loginRobots,
  publicIndexRobots,
  sitemapPublicPathnames,
  technicalAuthRobots,
} from "@/lib/seo/robots-policy";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("public metadata and SEO", () => {
  it("root layout declara idioma, title, description e Open Graph sem preço antigo", () => {
    const source = read("src/app/layout.tsx");
    expect(source).toContain("lang={brand.locale}");
    expect(source).toContain("metadataBase");
    expect(source).toContain("openGraph");
    expect(source).toContain("twitter");
    expect(source).toContain("viewport");
    expect(source).toContain("publicIndexRobots");
    expect(brand.locale).toBe("pt-BR");
    expect(brand.defaultDescription).toContain(`${TRIAL_DURATION_DAYS} dias`);
    expect(brand.defaultDescription).not.toMatch(/R\$\s*49/);
    expect(brand.defaultDescription).not.toMatch(/14 dias/);
  });

  it("landing declara robots indexáveis de forma explícita, não só por herança", () => {
    expect(read("src/app/(public)/page.tsx")).toContain("publicIndexRobots");
    expect(read("src/app/(public)/page.tsx")).toContain('canonical: "/"');
    expect(publicIndexRobots).toEqual({ index: true, follow: true });
  });

  it("cadastro é indexável como página de conversão; entrar não", () => {
    expect(read("src/app/(auth)/cadastro/page.tsx")).toContain("publicIndexRobots");
    expect(read("src/app/(auth)/cadastro/page.tsx")).toContain('canonical: "/cadastro"');
    expect(read("src/app/(auth)/entrar/page.tsx")).toContain("loginRobots");
    expect(read("src/app/(auth)/layout.tsx")).toContain("technicalAuthRobots");
    expect(loginRobots).toEqual({ index: false, follow: true });
    expect(technicalAuthRobots).toEqual({ index: false, follow: false });
  });

  it("rotas técnicas de auth declaram noindex/nofollow", () => {
    const files = [
      "src/app/(auth)/recuperar-senha/page.tsx",
      "src/app/(auth)/nova-senha/page.tsx",
      "src/app/(auth)/verifique-email/page.tsx",
      "src/app/(auth)/convite/page.tsx",
      "src/app/(auth)/onboarding/page.tsx",
      "src/app/auth/erro/page.tsx",
    ];

    for (const file of files) {
      expect(read(file)).toContain("technicalAuthRobots");
    }
  });

  it("robots libera landing/cadastro, não faz disallow de /entrar e bloqueia áreas internas", () => {
    const result = buildRobots({ NODE_ENV: "test" });
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.allow).toBe("/");
    expect(rules?.disallow).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/admin",
        "/assinatura",
        "/api/",
        "/auth/",
        "/recuperar-senha",
        "/nova-senha",
        "/convite",
        "/verifique-email",
        "/onboarding",
      ]),
    );
    expect(rules?.disallow).not.toEqual(expect.arrayContaining(["/cadastro"]));
    expect(rules?.disallow).not.toEqual(expect.arrayContaining(["/entrar"]));
    expect(result.sitemap).toMatch(/sitemap\.xml$/);
  });

  it("sitemap inclui só landing e cadastro; nunca /entrar nem localhost em production", () => {
    const entries = buildSitemap({
      NODE_ENV: "test",
      APP_URL: "https://app.example.com",
    });
    const urls = entries.map((entry) => entry.url);
    expect(sitemapPublicPathnames).toEqual(["/", "/cadastro"]);
    expect(urls).toEqual(["https://app.example.com", "https://app.example.com/cadastro"]);
    expect(urls.some((url) => url.endsWith("/entrar"))).toBe(false);
    expect(urls.some((url) => url.includes("/dashboard"))).toBe(false);
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);

    const productionEmpty = buildSitemap({ NODE_ENV: "production" });
    expect(productionEmpty).toEqual([]);
    expect(productionEmpty.some((entry) => entry.url.includes("localhost"))).toBe(false);

    const productionRobots = buildRobots({ NODE_ENV: "production" });
    expect(productionRobots.sitemap).toBeUndefined();
  });

  it("imagem social não anuncia preço", () => {
    const source = read("src/app/opengraph-image.tsx");
    expect(source).toContain("brand.tagline");
    expect(source).not.toMatch(/R\$/);
    expect(source).not.toMatch(/89,90/);
    expect(source).not.toMatch(/14 dias/);
  });
});
