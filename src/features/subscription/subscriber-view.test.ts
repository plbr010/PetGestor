import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeEntitlement } from "@/features/subscription/entitlement";
import {
  PAYMENT_METHOD_MANAGED_BY_MP,
  resolveSubscriberBadge,
  shouldShowCancelCta,
  shouldShowRegularizeCta,
} from "@/features/subscription/subscriber-view";
import { resolveSubscriptionPageState } from "@/features/subscription/subscription-ui";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { addHours } from "@/features/subscription/utils";
import { TRIAL_DURATION_HOURS } from "@/config/subscription";
import { formatAdminTrialRemaining } from "@/features/admin/utils";

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

describe("subscriber area badges and CTAs", () => {
  it("trial mostra TRIAL e tempo restante", () => {
    const subscription = buildSubscription();
    const now = addHours(new Date(subscription.trialStartedAt), 10);
    const entitlement = computeEntitlement(subscription, now);
    const state = resolveSubscriptionPageState(subscription, entitlement);

    expect(state).toBe("trial_active");
    expect(resolveSubscriberBadge(state)).toBe("TRIAL");
    expect(formatAdminTrialRemaining(subscription.trialEndsAt, now)).toBe("6d 14h restantes");
    expect(shouldShowRegularizeCta(state)).toBe(false);
  });

  it("past_due mostra INADIMPLENTE e CTA de regularização", () => {
    const subscription = buildSubscription({
      status: "past_due",
      subscribedAt: "2026-08-10T00:00:00.000Z",
      providerSubscriptionId: "preapproval-1",
    });
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, now);
    const state = resolveSubscriptionPageState(subscription, entitlement);

    expect(state).toBe("past_due");
    expect(resolveSubscriberBadge(state)).toBe("INADIMPLENTE");
    expect(shouldShowRegularizeCta(state)).toBe(true);
  });

  it("active mostra ATIVO, próxima cobrança real e cancelamento", () => {
    const nextPaymentAt = "2026-09-10T12:00:00.000Z";
    const subscription = buildSubscription({
      status: "active",
      subscribedAt: "2026-08-10T00:00:00.000Z",
      nextPaymentAt,
      providerSubscriptionId: "preapproval-1",
      providerStatus: "authorized",
    });
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, now);
    const state = resolveSubscriptionPageState(subscription, entitlement);

    expect(state).toBe("active");
    expect(resolveSubscriberBadge(state)).toBe("ATIVO");
    expect(subscription.nextPaymentAt).toBe(nextPaymentAt);
    expect(shouldShowCancelCta(state)).toBe(true);
    expect(shouldShowRegularizeCta(state)).toBe(false);
  });

  it("cancelled mostra CANCELADO", () => {
    const subscription = buildSubscription({
      status: "cancelled",
      cancelledAt: "2026-08-12T00:00:00.000Z",
      providerStatus: "cancelled",
    });
    const now = addHours(new Date(subscription.trialStartedAt), TRIAL_DURATION_HOURS + 1);
    const entitlement = computeEntitlement(subscription, now);
    const state = resolveSubscriptionPageState(subscription, entitlement);

    expect(state).toBe("cancelled");
    expect(resolveSubscriberBadge(state)).toBe("CANCELADO");
  });

  it("checkout pendente mostra PAGAMENTO PENDENTE", () => {
    const subscription = buildSubscription({
      status: "trialing",
      trialEndsAt: "2026-08-01T00:00:00.000Z",
      providerStatus: "pending",
      providerCheckoutUrl: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=x",
    });
    const now = new Date("2026-08-10T00:00:00.000Z");
    const entitlement = computeEntitlement(subscription, now);
    const state = resolveSubscriptionPageState(subscription, entitlement);

    expect(state).toBe("checkout_pending");
    expect(resolveSubscriberBadge(state)).toBe("PAGAMENTO PENDENTE");
  });
});

describe("subscriber area security surface", () => {
  it("não renderiza payload sensível do Mercado Pago", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/subscription/components/subscription-page-content.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/access[_-]?token/i);
    expect(source).not.toMatch(/\bcvv\b/i);
    expect(source).not.toMatch(/card_number|cardNumber/i);
    expect(source).not.toContain("JSON.stringify");
    expect(PAYMENT_METHOD_MANAGED_BY_MP).toBe(
      "Forma de pagamento gerenciada pelo Mercado Pago",
    );
  });

  it("página /assinatura deriva empresa do contexto autenticado", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/assinatura/page.tsx"),
      "utf8",
    );

    expect(source).toContain("requireUser");
    expect(source).toContain("requireCompany");
    expect(source).toContain("requireCompanySubscription");
    expect(source).toContain("DashboardHeader");
    expect(source).not.toMatch(/searchParams.*company/i);
    expect(source).not.toContain("createSupabaseAdminClient");
    expect(source).not.toContain("AuthShell");
    expect(source).not.toContain("signOut");
  });

  it("cliente comum não acessa telefone cross-tenant via admin", () => {
    const adminLayout = readFileSync(
      join(process.cwd(), "src/app/(admin)/layout.tsx"),
      "utf8",
    );
    const adminQueries = readFileSync(
      join(process.cwd(), "src/features/admin/queries.ts"),
      "utf8",
    );

    expect(adminLayout).toContain("requirePlatformAdmin");
    expect(adminQueries).toContain("requirePlatformAdmin");
    expect(adminQueries).toContain("ownerPhone");
  });
});
