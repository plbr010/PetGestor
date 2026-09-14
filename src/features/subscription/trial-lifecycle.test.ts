import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TRIAL_DURATION_HOURS } from "@/config/subscription";
import { computeEntitlement } from "@/features/subscription/entitlement";
import { canStartMercadoPagoCheckout } from "@/features/subscription/subscription-ui";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { addHours } from "@/features/subscription/utils";

function buildSubscription(
  overrides: Partial<CompanySubscriptionRecord> = {},
): CompanySubscriptionRecord {
  const started = new Date("2026-08-06T14:37:00.000Z");
  return {
    companyId: "550e8400-e29b-41d4-a716-446655440000",
    planCode: "petgestor_monthly",
    billingInterval: "monthly",
    offerCode: null,
    status: "trialing",
    trialStartedAt: started.toISOString(),
    trialEndsAt: addHours(started, TRIAL_DURATION_HOURS).toISOString(),
    provider: null,
    providerSubscriptionId: null,
    providerStatus: null,
    providerCheckoutUrl: null,
    checkoutStartedAt: null,
    subscribedAt: null,
    nextPaymentAt: null,
    lastPaymentAt: null,
    lastPaymentStatus: null,
    cancelledAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("trial não reinicia", () => {
  it("update de billing não inclui trial_started_at nem trial_ends_at", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/subscription/billing-repository.ts"),
      "utf8",
    );
    expect(source).toMatch(/export type BillingSubscriptionUpdate/);
    const typeBlock = source.slice(
      source.indexOf("export type BillingSubscriptionUpdate"),
      source.indexOf("const SUBSCRIPTION_COLUMNS"),
    );
    expect(typeBlock).not.toContain("trial_started_at");
    expect(typeBlock).not.toContain("trial_ends_at");
  });

  it("onboarding cria trial uma vez (ON CONFLICT DO NOTHING)", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260911400000_bloco8_auth_onboarding_rate_limit.sql"),
      "utf8",
    );
    expect(sql).toContain("complete_onboarding");
    expect(sql).toContain("private.create_company_subscription");

    const trialFn = readFileSync(
      join(process.cwd(), "supabase/migrations/20260825120000_trial_7_days.sql"),
      "utf8",
    );
    expect(trialFn).toContain("now() + interval '7 days'");
    expect(trialFn).toContain("ON CONFLICT (company_id) DO NOTHING");
  });

  it("checkout, cancelamento e login usam o trial_ends_at persistido", () => {
    const started = new Date("2026-01-01T00:00:00.000Z");
    const ends = addHours(started, TRIAL_DURATION_HOURS);
    const afterCheckout = buildSubscription({
      trialStartedAt: started.toISOString(),
      trialEndsAt: ends.toISOString(),
      provider: "mercado_pago",
      providerStatus: "pending",
      checkoutStartedAt: "2026-01-10T00:00:00.000Z",
    });
    const afterCancel = buildSubscription({
      trialStartedAt: started.toISOString(),
      trialEndsAt: ends.toISOString(),
      status: "cancelled",
      cancelledAt: "2026-01-11T00:00:00.000Z",
    });

    const now = addHours(started, 24);
    expect(computeEntitlement(afterCheckout, now).state).toBe("trialing");
    expect(new Date(afterCheckout.trialEndsAt).getTime()).toBe(ends.getTime());
    expect(new Date(afterCancel.trialEndsAt).getTime()).toBe(ends.getTime());
  });

  it("novo checkout após trial expirado não reabre o trial", () => {
    const subscription = buildSubscription({
      status: "trialing",
      providerStatus: "pending",
    });
    const afterEnd = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS);
    expect(computeEntitlement(subscription, afterEnd).state).toBe("trial_expired");
    expect(canStartMercadoPagoCheckout(subscription, afterEnd)).toBe(true);
  });
});
