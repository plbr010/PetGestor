import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { brand } from "@/config/brand";
import { TRIAL_DURATION_DAYS } from "@/config/subscription";

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
    expect(brand.locale).toBe("pt-BR");
    expect(brand.defaultDescription).toContain(`${TRIAL_DURATION_DAYS} dias`);
    expect(brand.defaultDescription).not.toMatch(/R\$\s*49/);
    expect(brand.defaultDescription).not.toMatch(/14 dias/);
  });

  it("robots libera landing e bloqueia áreas internas", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.allow).toBe("/");
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(["/dashboard", "/admin", "/assinatura", "/api/", "/auth/"]),
    );
    expect(rules?.disallow).not.toEqual(expect.arrayContaining(["/cadastro", "/entrar"]));
    expect(result.sitemap).toMatch(/sitemap\.xml$/);
  });

  it("sitemap inclui só rotas públicas de conversão", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/cadastro"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/entrar"))).toBe(true);
    expect(urls.some((url) => url.includes("/dashboard"))).toBe(false);
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
  });

  it("imagem social não anuncia preço", () => {
    const source = read("src/app/opengraph-image.tsx");
    expect(source).toContain("brand.tagline");
    expect(source).not.toMatch(/R\$/);
    expect(source).not.toMatch(/89,90/);
    expect(source).not.toMatch(/14 dias/);
  });
});
