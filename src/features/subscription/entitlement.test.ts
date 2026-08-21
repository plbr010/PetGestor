import { describe, expect, it } from "vitest";

import {
  PLAN_MONTHLY_PRICE_CENTS,
  TRIAL_DURATION_HOURS,
} from "@/config/subscription";
import {
  computeEntitlement,
  isTrialExpired,
} from "@/features/subscription/entitlement";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { addHours, msBetween } from "@/features/subscription/utils";

function buildSubscription(
  overrides: Partial<CompanySubscriptionRecord> = {},
): CompanySubscriptionRecord {
  const started = new Date("2026-08-06T14:37:00.000Z");
  return {
    companyId: "550e8400-e29b-41d4-a716-446655440000",
    planCode: "petgestor_monthly",
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

describe("computeEntitlement", () => {
  const started = new Date("2026-08-06T14:37:00.000Z");
  const ends = addHours(started, TRIAL_DURATION_HOURS);

  it("trial exatamente 72 horas entre início e fim", () => {
    const subscription = buildSubscription();
    expect(msBetween(new Date(subscription.trialStartedAt), new Date(subscription.trialEndsAt))).toBe(
      TRIAL_DURATION_HOURS * 3_600_000,
    );
  });

  it("71h59min após início → acesso permitido", () => {
    const subscription = buildSubscription();
    const now = addHours(started, TRIAL_DURATION_HOURS - 1 / 60);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("trialing");
  });

  it("72h00min após início → bloqueado", () => {
    const subscription = buildSubscription();
    const now = addHours(started, TRIAL_DURATION_HOURS);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("trial_expired");
  });

  it("active → permitido", () => {
    const subscription = buildSubscription({ status: "active" });
    const entitlement = computeEntitlement(subscription, ends);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("active");
  });

  it("past_due → bloqueado", () => {
    const subscription = buildSubscription({ status: "past_due" });
    const entitlement = computeEntitlement(subscription, started);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("past_due");
  });

  it("cancelled sem período → bloqueado", () => {
    const subscription = buildSubscription({ status: "cancelled" });
    const entitlement = computeEntitlement(subscription, started);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("cancelled");
  });

  it("devBypass ignora expiração", () => {
    const subscription = buildSubscription();
    const now = addHours(started, TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, now, { devBypass: true });
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("active");
  });

  it("billingExempt (conta admin) mantém acesso permanente", () => {
    const subscription = buildSubscription({ status: "trialing" });
    const now = addHours(started, TRIAL_DURATION_HOURS + 48);
    const entitlement = computeEntitlement(subscription, now, { billingExempt: true });
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("active");
  });

  it("sem subscription → bloqueado", () => {
    const entitlement = computeEntitlement(null, started);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("trial_expired");
  });
});

describe("isTrialExpired", () => {
  it("detecta expiração após 72h", () => {
    const subscription = buildSubscription();
    const started = new Date(subscription.trialStartedAt);
    expect(isTrialExpired(subscription, addHours(started, TRIAL_DURATION_HOURS))).toBe(true);
  });
});

describe("PLAN_MONTHLY_PRICE_CENTS", () => {
  it("define preço de 8990 centavos", () => {
    expect(PLAN_MONTHLY_PRICE_CENTS).toBe(8990);
  });
});
