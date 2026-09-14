import type { BillingInterval } from "@/config/subscription";
import { computeEntitlement } from "@/features/subscription/entitlement";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import {
  isActiveProviderSubscription,
  isCancelledProviderSubscription,
  isReusablePendingCheckout,
} from "@/features/subscription/provider-status";

export function resolveSubscriptionPageState(
  subscription: CompanySubscriptionRecord,
  entitlement: CompanyEntitlement,
):
  | "trial_active"
  | "trial_expired"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "unavailable" {
  if (entitlement.billingUnavailable || entitlement.state === "unavailable") {
    return "unavailable";
  }

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

  if (entitlement.state === "active") {
    return "active";
  }

  if (entitlement.state === "past_due") {
    return "past_due";
  }

  if (entitlement.state === "cancelled") {
    return "cancelled";
  }

  if (entitlement.state === "expired") {
    return "expired";
  }

  if (
    subscription.status === "cancelled" ||
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
  return computeEntitlement(subscription, serverNow).state === "trialing";
}

export function canStartMercadoPagoCheckout(
  subscription: CompanySubscriptionRecord,
  serverNow: Date,
): boolean {
  const entitlement = computeEntitlement(subscription, serverNow);

  if (entitlement.state === "trialing") {
    return false;
  }

  // Assinatura paga vigente (não residual de cancelamento) não inicia novo checkout de subscribe.
  if (entitlement.state === "active") {
    return false;
  }

  if (isActiveProviderSubscription(subscription.providerStatus) && entitlement.hasOperationalAccess) {
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
  serverNow: Date = new Date(),
): PlanChangeKind {
  const entitlement = computeEntitlement(subscription, serverNow);
  const isLive = entitlement.state === "active";

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
    pageState === "checkout_pending" ||
    pageState === "expired"
  );
}
