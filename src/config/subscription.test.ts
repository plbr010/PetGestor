import { describe, expect, it, vi } from "vitest";

import {
  addCalendarYears,
  ANNUAL_OFFER_CODE_LAUNCH,
  computePaidPeriodEnd,
  formatTrialCtaLabel,
  formatTrialNote,
  formatTrialPeriodLabel,
  parseBillingInterval,
  PLAN_ANNUAL_MONTHLY_EQUIVALENT_CENTS,
  PLAN_ANNUAL_PRICE_CENTS,
  PLAN_ANNUAL_SAVINGS_CENTS,
  PLAN_CODE,
  PLAN_CODES,
  PLAN_MONTHLY_PRICE_CENTS,
  priceCentsForInterval,
  TRIAL_DURATION_DAYS,
  TRIAL_DURATION_HOURS,
  isBillingDevBypassEnabled,
} from "@/config/subscription";

describe("subscription config", () => {
  it("define trial de 7 dias completos (168 horas)", () => {
    expect(TRIAL_DURATION_DAYS).toBe(7);
    expect(TRIAL_DURATION_HOURS).toBe(168);
    expect(TRIAL_DURATION_HOURS).toBe(TRIAL_DURATION_DAYS * 24);
  });

  it("mantém plano mensal e adiciona anual com preços server-side", () => {
    expect(PLAN_CODE).toBe("petgestor_monthly");
    expect(PLAN_CODES.monthly).toBe("petgestor_monthly");
    expect(PLAN_CODES.annual).toBe("petgestor_annual");
    expect(PLAN_MONTHLY_PRICE_CENTS).toBe(8990);
    expect(PLAN_ANNUAL_PRICE_CENTS).toBe(79900);
    expect(PLAN_ANNUAL_MONTHLY_EQUIVALENT_CENTS).toBe(6658);
    expect(PLAN_ANNUAL_SAVINGS_CENTS).toBe(27980);
    expect(priceCentsForInterval("monthly")).toBe(8990);
    expect(priceCentsForInterval("annual")).toBe(79900);
    expect(ANNUAL_OFFER_CODE_LAUNCH).toBe("annual_launch_799");
  });

  it("parseia billing interval sem aceitar preço do cliente", () => {
    expect(parseBillingInterval("monthly")).toBe("monthly");
    expect(parseBillingInterval("annual")).toBe("annual");
    expect(() => parseBillingInterval("price=1")).toThrow("invalid_billing_interval");
    expect(() => parseBillingInterval(null)).toThrow("invalid_billing_interval");
  });

  it("calcula período anual por calendário (12 meses)", () => {
    const start = new Date("2026-08-24T15:00:00.000Z");
    expect(addCalendarYears(start, 1).toISOString()).toBe("2027-08-24T15:00:00.000Z");
    expect(computePaidPeriodEnd(start, "annual").toISOString()).toBe(
      "2027-08-24T15:00:00.000Z",
    );
    expect(computePaidPeriodEnd(start, "monthly").toISOString()).toBe(
      "2026-09-24T15:00:00.000Z",
    );
  });

  it("formata textos de marketing do trial", () => {
    expect(formatTrialPeriodLabel()).toBe("7 dias");
    expect(formatTrialCtaLabel()).toBe("Teste grátis por 7 dias");
    expect(formatTrialNote()).toContain("7 dias");
    expect(formatTrialNote()).toContain("Sem cartão");
  });

  it("não habilita bypass em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_DEV_BYPASS", "true");
    expect(isBillingDevBypassEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
