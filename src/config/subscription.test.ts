import { describe, expect, it, vi } from "vitest";

import {
  formatTrialCtaLabel,
  formatTrialNote,
  formatTrialPeriodLabel,
  PLAN_CODE,
  PLAN_MONTHLY_PRICE_CENTS,
  TRIAL_DURATION_DAYS,
  TRIAL_DURATION_HOURS,
  isBillingDevBypassEnabled,
} from "@/config/subscription";

describe("subscription config", () => {
  it("define trial de 72 horas (3 dias comerciais)", () => {
    expect(TRIAL_DURATION_HOURS).toBe(72);
    expect(TRIAL_DURATION_DAYS).toBe(3);
  });

  it("define plano mensal", () => {
    expect(PLAN_CODE).toBe("petgestor_monthly");
    expect(PLAN_MONTHLY_PRICE_CENTS).toBe(8990);
  });

  it("formata textos de marketing do trial", () => {
    expect(formatTrialPeriodLabel()).toBe("3 dias");
    expect(formatTrialCtaLabel()).toBe("Teste grátis por 3 dias");
    expect(formatTrialNote()).toContain("3 dias");
    expect(formatTrialNote()).toContain("Sem cartão");
  });

  it("não habilita bypass em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_DEV_BYPASS", "true");
    expect(isBillingDevBypassEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
