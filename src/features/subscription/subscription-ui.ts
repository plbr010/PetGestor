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

  if (
    isReusablePendingCheckout(subscription.providerStatus) &&
    subscription.providerCheckoutUrl
  ) {
    return "checkout_pending";
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
