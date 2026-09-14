import { describe, expect, it } from "vitest";

import { TRIAL_DURATION_HOURS } from "@/config/subscription";
import { computeEntitlement } from "@/features/subscription/entitlement";
import {
  canStartMercadoPagoCheckout,
  resolveSubscriptionPageState,
} from "@/features/subscription/subscription-ui";
import { resolveSubscriberBadge } from "@/features/subscription/subscriber-view";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { addHours } from "@/features/subscription/utils";
import { SUBSCRIPTION_REQUIRED_PATH } from "@/features/subscription/require-entitlement";

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

describe("acesso SaaS canônico", () => {
  it("trial válido → dashboard", () => {
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), 1);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("trial_active");
  });

  it("trial expirado → regularização, sem loop", () => {
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("trial_expired");
    expect(SUBSCRIPTION_REQUIRED_PATH).toBe("/assinatura");
    expect(resolveSubscriberBadge("trial_expired")).toBe("EXPIRADO");
  });

  it("active vigente → dashboard", () => {
    const subscription = buildSubscription({
      status: "active",
      currentPeriodStart: "2026-08-10T00:00:00.000Z",
      currentPeriodEnd: "2026-09-10T00:00:00.000Z",
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-08-20T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("active");
    expect(resolveSubscriberBadge("active")).toBe("ATIVO");
  });

  it("past_due → bloqueado com regularização", () => {
    const subscription = buildSubscription({ status: "past_due" });
    const entitlement = computeEntitlement(subscription, new Date());
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("past_due");
  });

  it("cancelled com acesso residual continua no painel até o fim do período", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      currentPeriodStart: "2026-08-10T00:00:00.000Z",
      currentPeriodEnd: "2026-09-10T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-08-20T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(resolveSubscriptionPageState(subscription, entitlement)).toBe("cancelled");
    expect(resolveSubscriberBadge("cancelled")).toBe("CANCELADO");
  });

  it("cancelled/expired sem período → bloqueado", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-08-10T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(false);
  });

  it("active vencido não mostra ATIVO e permite checkout", () => {
    const subscription = buildSubscription({
      status: "active",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    });
    const now = new Date("2026-08-02T00:00:00.000Z");
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.state).toBe("expired");
    expect(resolveSubscriberBadge(resolveSubscriptionPageState(subscription, entitlement))).toBe(
      "EXPIRADO",
    );
    expect(canStartMercadoPagoCheckout(subscription, now)).toBe(true);
  });

  it("billing unavailable bloqueia dashboard e a página de assinatura permanece acessível", () => {
    const entitlement = computeEntitlement(null, new Date(), { billingUnavailable: true });
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("unavailable");
    expect(SUBSCRIPTION_REQUIRED_PATH).toBe("/assinatura");
  });
});
