import { isBillingDevBypassEnabled } from "@/config/subscription";
import type {
  CompanyEntitlement,
  CompanySubscriptionRecord,
  EntitlementOptions,
} from "@/features/subscription/types";
import type { SubscriptionStatus } from "@/types/database.types";

export function mapSubscriptionRow(row: {
  company_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  trial_started_at: string;
  trial_ends_at: string;
  provider: string | null;
  provider_subscription_id: string | null;
  provider_status?: string | null;
  provider_checkout_url?: string | null;
  checkout_started_at?: string | null;
  subscribed_at?: string | null;
  next_payment_at?: string | null;
  last_payment_at?: string | null;
  last_payment_status?: string | null;
  cancelled_at?: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}): CompanySubscriptionRecord {
  return {
    companyId: row.company_id,
    planCode: row.plan_code,
    status: row.status,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    providerStatus: row.provider_status ?? null,
    providerCheckoutUrl: row.provider_checkout_url ?? null,
    checkoutStartedAt: row.checkout_started_at ?? null,
    subscribedAt: row.subscribed_at ?? null,
    nextPaymentAt: row.next_payment_at ?? null,
    lastPaymentAt: row.last_payment_at ?? null,
    lastPaymentStatus: row.last_payment_status ?? null,
    cancelledAt: row.cancelled_at ?? null,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export function computeEntitlement(
  subscription: CompanySubscriptionRecord | null,
  serverNow: Date,
  options: EntitlementOptions = {},
): CompanyEntitlement {
  const serverNowIso = serverNow.toISOString();
  const devBypass = options.devBypass ?? isBillingDevBypassEnabled();

  if (devBypass) {
    return {
      state: "active",
      hasOperationalAccess: true,
      subscription,
      serverNowIso,
    };
  }

  if (!subscription) {
    return {
      state: "trial_expired",
      hasOperationalAccess: false,
      subscription: null,
      serverNowIso,
    };
  }

  const nowMs = serverNow.getTime();
  const trialEndsMs = new Date(subscription.trialEndsAt).getTime();

  if (subscription.status === "active") {
    return {
      state: "active",
      hasOperationalAccess: true,
      subscription,
      serverNowIso,
    };
  }

  if (subscription.status === "trialing") {
    if (nowMs < trialEndsMs) {
      return {
        state: "trialing",
        hasOperationalAccess: true,
        subscription,
        serverNowIso,
      };
    }

    return {
      state: "trial_expired",
      hasOperationalAccess: false,
      subscription,
      serverNowIso,
    };
  }

  if (subscription.status === "past_due") {
    return {
      state: "past_due",
      hasOperationalAccess: false,
      subscription,
      serverNowIso,
    };
  }

  if (subscription.status === "cancelled") {
    const periodEndMs = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).getTime()
      : 0;

    if (periodEndMs > nowMs) {
      return {
        state: "active",
        hasOperationalAccess: true,
        subscription,
        serverNowIso,
      };
    }

    return {
      state: "cancelled",
      hasOperationalAccess: false,
      subscription,
      serverNowIso,
    };
  }

  return {
    state: "trial_expired",
    hasOperationalAccess: false,
    subscription,
    serverNowIso,
  };
}

export function isTrialActive(
  subscription: CompanySubscriptionRecord,
  serverNow: Date,
): boolean {
  return computeEntitlement(subscription, serverNow).state === "trialing";
}

export function isTrialExpired(
  subscription: CompanySubscriptionRecord,
  serverNow: Date,
): boolean {
  return computeEntitlement(subscription, serverNow).state === "trial_expired";
}
