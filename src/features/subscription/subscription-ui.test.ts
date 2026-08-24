import { describe, expect, it } from "vitest";

import { computeEntitlement } from "@/features/subscription/entitlement";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import {
  canStartMercadoPagoCheckout,
  isTrialStillActiveServerSide,
  resolvePlanChangeKind,
  resolveSubscriptionPageState,
} from "@/features/subscription/subscription-ui";
import { addHours } from "@/features/subscription/utils";
import { TRIAL_DURATION_HOURS } from "@/config/subscription";

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

describe("checkout rules", () => {
  it("bloqueia checkout antes de 72h", () => {
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS - 1);
    expect(isTrialStillActiveServerSide(subscription, now)).toBe(true);
    expect(canStartMercadoPagoCheckout(subscription, now)).toBe(false);
  });

  it("permite checkout após 72h", () => {
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS);
    expect(isTrialStillActiveServerSide(subscription, now)).toBe(false);
    expect(canStartMercadoPagoCheckout(subscription, now)).toBe(true);
  });

  it("não confia em query param — entitlement usa servidor", () => {
    const subscription = buildSubscription({ status: "trialing" });
    const expiredNow = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, expiredNow);
    expect(entitlement.hasOperationalAccess).toBe(false);
  });
});

describe("plan change rules", () => {
  it("mensal ativo pode mudar para anual", () => {
    const subscription = buildSubscription({
      status: "active",
      billingInterval: "monthly",
      providerStatus: "authorized",
      providerSubscriptionId: "pre-1",
    });
    expect(resolvePlanChangeKind(subscription, "annual")).toBe("upgrade_to_annual");
    expect(resolvePlanChangeKind(subscription, "monthly")).toBe("same_plan");
  });

  it("anual ativo não muda para mensal imediatamente", () => {
    const subscription = buildSubscription({
      status: "active",
      billingInterval: "annual",
      planCode: "petgestor_annual",
      providerStatus: "authorized",
      providerSubscriptionId: "pre-2",
    });
    expect(resolvePlanChangeKind(subscription, "monthly")).toBe("annual_to_monthly_blocked");
  });

  it("checkout pendente tem prioridade mesmo com período pago restante", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      billingInterval: "annual",
      planCode: "petgestor_annual",
      providerStatus: "pending",
      providerCheckoutUrl: "https://mp.example/checkout",
      providerSubscriptionId: "pre-pending",
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-09-01T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("checkout_pending");
  });
});
