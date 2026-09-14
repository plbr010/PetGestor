import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { marketingContent } from "@/config/marketing";
import { isProtectedAppPath, publicPaths } from "@/config/public-routes";
import {
  PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL,
  PLAN_ANNUAL_PRICE_LABEL,
  PLAN_ANNUAL_SAVINGS_LABEL,
  PLAN_MONTHLY_PRICE_LABEL,
  PLAN_OPERATIONAL_ACCESS_LABEL,
  TRIAL_DURATION_DAYS,
  formatTrialCtaLabel,
  formatTrialNote,
} from "@/config/subscription";

const marketingSource = readFileSync(
  join(process.cwd(), "src/config/marketing.ts"),
  "utf8",
);

describe("marketing content", () => {
  it("usa a fonte canônica de trial e preços", () => {
    expect(marketingContent.trialDurationDays).toBe(TRIAL_DURATION_DAYS);
    expect(marketingContent.trialCtaLabel).toBe(formatTrialCtaLabel());
    expect(marketingContent.trialNote).toBe(formatTrialNote());
    expect(marketingContent.pricing.monthly.price).toBe(PLAN_MONTHLY_PRICE_LABEL);
    expect(marketingContent.pricing.annual.price).toBe(PLAN_ANNUAL_PRICE_LABEL);
    expect(marketingContent.pricing.annual.equivalent).toContain(
      PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL,
    );
    expect(marketingContent.pricing.annual.savings).toContain(PLAN_ANNUAL_SAVINGS_LABEL);
    expect(marketingContent.pricing.monthly.bullets).toContain(PLAN_OPERATIONAL_ACCESS_LABEL);
  });

  it("não duplica valores comerciais no arquivo de marketing", () => {
    expect(marketingSource).toContain("PLAN_MONTHLY_PRICE_LABEL");
    expect(marketingSource).toContain("PLAN_ANNUAL_PRICE_LABEL");
    expect(marketingSource).toContain("TRIAL_DURATION_DAYS");
    expect(marketingSource).not.toMatch(/R\$\s*89/);
    expect(marketingSource).not.toMatch(/R\$\s*799/);
    expect(marketingSource).not.toMatch(/89,90/);
    expect(marketingSource).not.toMatch(/799,00/);
  });

  it("aponta demonstração para prévia pública, não para área protegida", () => {
    expect(marketingContent.demoHref).toBe(publicPaths.demo);
    expect(marketingContent.demoHref).toBe("/#demonstracao");
    expect(isProtectedAppPath(marketingContent.demoHref)).toBe(false);
    expect(marketingContent.loginHref).toBe(publicPaths.login);
    expect(marketingContent.signupHref).toBe(publicPaths.signup);
  });

  it("não anuncia módulos como futuras fases nem claims indisponíveis", () => {
    const serialized = JSON.stringify(marketingContent);
    expect(serialized).not.toMatch(/próximas fases/i);
    expect(serialized).not.toMatch(/em breve/i);
    expect(serialized).not.toMatch(/chatbot/i);
    expect(serialized).not.toMatch(/inteligência artificial/i);
    expect(serialized).not.toMatch(/disparo em massa/i);
    expect(marketingContent.benefits.some((item) => item.title.includes("Agenda"))).toBe(
      true,
    );
    expect(marketingContent.benefits.some((item) => item.title.includes("PDV"))).toBe(true);
    expect(marketingContent.benefits.some((item) => item.title.includes("Relatórios"))).toBe(
      true,
    );
  });

  it("usa âncoras públicas estáveis para a landing", () => {
    expect(marketingContent.navLinks.map((link) => link.href)).toEqual([
      publicPaths.features,
      publicPaths.howItWorks,
      publicPaths.pricing,
    ]);
  });
});
