import type { BillingInterval } from "@/config/subscription";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import {
  isActiveProviderSubscription,
  isCancelledProviderSubscription,
  isReusablePendingCheckout,
} from "@/features/subscription/provider-status";

export function resolveSubscriptionPageState(
  subscription: CompanySubscriptionRecord,
  entitlement: CompanyEntitlement,
): "trial_active" | "trial_expired" | "checkout_pending" | "active" | "past_due" | "cancelled" {
  if (entitlement.state === "trialing") {
    return "trial_active";
  }

  // Checkout pendente tem prioridade (ex.: upgrade mensal→anual com período ainda válido).
  if (
    isReusablePendingCheckout(subscription.providerStatus) &&
    subscription.providerCheckoutUrl
  ) {
    return "checkout_pending";
  }

  if (subscription.status === "active" || entitlement.state === "active") {
    return "active";
  }

  if (subscription.status === "past_due" || entitlement.state === "past_due") {
    return "past_due";
  }

  if (
    subscription.status === "cancelled" ||
    entitlement.state === "cancelled" ||
    isCancelledProviderSubscription(subscription.providerStatus)
  ) {
    return "cancelled";
  }

  return "trial_expired";
}

export function isTrialStillActiveServerSide(
  subscription: CompanySubscriptionRecord,
  serverNow: Date,
): boolean {
  return serverNow.getTime() < new Date(subscription.trialEndsAt).getTime();
}

export function canStartMercadoPagoCheckout(
  subscription: CompanySubscriptionRecord,
  serverNow: Date,
): boolean {
  if (isTrialStillActiveServerSide(subscription, serverNow)) {
    return false;
  }

  if (subscription.status === "active" || isActiveProviderSubscription(subscription.providerStatus)) {
    return false;
  }

  return true;
}

export type PlanChangeKind = "subscribe" | "upgrade_to_annual" | "same_plan" | "annual_to_monthly_blocked";

/**
 * Regras de troca sem inventar prorrata:
 * - mensal ativo → anual: permitido (cancela renovação mensal, cobra R$799, ativa só após pagamento)
 * - anual ativo → mensal: bloqueado até o fim do período (cancelar renovação e assinar depois)
 * - mesmo plano: sem ação de checkout
 */
export function resolvePlanChangeKind(
  subscription: CompanySubscriptionRecord,
  target: BillingInterval,
): PlanChangeKind {
  const isLive =
    subscription.status === "active" || isActiveProviderSubscription(subscription.providerStatus);

  if (!isLive) {
    return "subscribe";
  }

  if (subscription.billingInterval === target) {
    return "same_plan";
  }

  if (subscription.billingInterval === "monthly" && target === "annual") {
    return "upgrade_to_annual";
  }

  return "annual_to_monthly_blocked";
}

export function canShowPlanPicker(
  pageState: ReturnType<typeof resolveSubscriptionPageState>,
): boolean {
  return (
    pageState === "trial_expired" ||
    pageState === "cancelled" ||
    pageState === "past_due" ||
    pageState === "active" ||
    pageState === "checkout_pending"
  );
}
