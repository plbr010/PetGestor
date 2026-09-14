import { describe, expect, it, vi } from "vitest";

import { TRIAL_DURATION_HOURS } from "@/config/subscription";
import { computeEntitlement, isTrialExpired } from "@/features/subscription/entitlement";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { addHours, msBetween } from "@/features/subscription/utils";

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

describe("computeEntitlement", () => {
  const started = new Date("2026-08-06T14:37:00.000Z");
  const ends = addHours(started, TRIAL_DURATION_HOURS);

  it("trial exatamente 7 dias (168h) entre início e fim", () => {
    const subscription = buildSubscription();
    expect(msBetween(new Date(subscription.trialStartedAt), new Date(subscription.trialEndsAt))).toBe(
      TRIAL_DURATION_HOURS * 3_600_000,
    );
  });

  it("1 segundo antes de trial_ends_at → acesso", () => {
    const subscription = buildSubscription();
    const now = new Date(ends.getTime() - 1000);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("trialing");
  });

  it("quase no fim do trial → acesso permitido", () => {
    const subscription = buildSubscription();
    const now = addHours(started, TRIAL_DURATION_HOURS - 1 / 60);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("trialing");
  });

  it("no instante do fim do trial → bloqueado", () => {
    const subscription = buildSubscription();
    const now = addHours(started, TRIAL_DURATION_HOURS);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("trial_expired");
  });

  it("depois do trial sem assinatura paga → bloqueado", () => {
    const subscription = buildSubscription();
    const entitlement = computeEntitlement(subscription, addHours(ends, 1));
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("trial_expired");
  });

  it("active com período vigente → permitido", () => {
    const subscription = buildSubscription({
      status: "active",
      currentPeriodStart: started.toISOString(),
      currentPeriodEnd: addHours(ends, 24 * 30).toISOString(),
    });
    const entitlement = computeEntitlement(subscription, ends);
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("active");
  });

  it("status active sem período válido → fail-closed", () => {
    const subscription = buildSubscription({ status: "active" });
    const entitlement = computeEntitlement(subscription, ends);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("expired");
  });

  it("preapproval authorized sem current_period_end → sem acesso pago", () => {
    const subscription = buildSubscription({
      status: "trialing",
      providerStatus: "authorized",
      providerSubscriptionId: "pre-authorized",
    });
    const entitlement = computeEntitlement(subscription, ends);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).not.toBe("active");
  });

  it("active com período vencido → expired, sem acesso", () => {
    const subscription = buildSubscription({
      status: "active",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-08-01T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("expired");
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

  it("cancelled anual com período pago restante → acesso residual, não mostra active", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      billingInterval: "annual",
      planCode: "petgestor_annual",
      cancelAtPeriodEnd: true,
      currentPeriodStart: "2026-08-24T15:00:00.000Z",
      currentPeriodEnd: "2027-08-24T15:00:00.000Z",
    });
    const entitlement = computeEntitlement(
      subscription,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(entitlement.hasOperationalAccess).toBe(true);
    expect(entitlement.state).toBe("cancelled");
  });

  it("cancelled após current_period_end → sem acesso", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
    const entitlement = computeEntitlement(subscription, new Date("2026-08-01T00:00:00.000Z"));
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("cancelled");
  });

  it("billing indisponível → fail-closed operacional", () => {
    const subscription = buildSubscription({ status: "active" });
    const entitlement = computeEntitlement(subscription, started, { billingUnavailable: true });
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("unavailable");
    expect(entitlement.billingUnavailable).toBe(true);
  });

  it("status desconhecido → fail-closed", () => {
    const subscription = buildSubscription({
      status: "unknown" as CompanySubscriptionRecord["status"],
    });
    const entitlement = computeEntitlement(subscription, started);
    expect(entitlement.hasOperationalAccess).toBe(false);
  });

  it("devBypass ignora expiração só quando a opção é explícita", () => {
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
  it("detecta expiração após 7 dias", () => {
    const subscription = buildSubscription();
    const started = new Date(subscription.trialStartedAt);
    expect(isTrialExpired(subscription, addHours(started, TRIAL_DURATION_HOURS))).toBe(true);
  });
});

describe("BILLING_DEV_BYPASS em produção", () => {
  it("não libera acesso mesmo com env true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_DEV_BYPASS", "true");
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, now);
    expect(entitlement.hasOperationalAccess).toBe(false);
    expect(entitlement.state).toBe("trial_expired");
    vi.unstubAllEnvs();
  });
});
