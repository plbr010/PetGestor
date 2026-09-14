import type { BillingInterval } from "@/config/subscription";
import type { SubscriptionStatus } from "@/types/database.types";

/** Fonte canônica de acesso SaaS — nunca decidir só pelo status persistido. */
export type EntitlementState =
  | "trialing"
  | "trial_expired"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "unavailable";

export type CompanySubscriptionRecord = {
  companyId: string;
  planCode: string;
  billingInterval: BillingInterval;
  offerCode: string | null;
  status: SubscriptionStatus;
  trialStartedAt: string;
  trialEndsAt: string;
  provider: string | null;
  providerSubscriptionId: string | null;
  providerStatus: string | null;
  providerCheckoutUrl: string | null;
  checkoutStartedAt: string | null;
  subscribedAt: string | null;
  nextPaymentAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string | null;
  cancelledAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  providerUpdatedAt?: string | null;
  checkoutIdempotencyKey?: string | null;
};

export type SubscriptionPageState =
  | "trial_active"
  | "trial_expired"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "unavailable";

export type CompanyEntitlement = {
  state: EntitlementState;
  hasOperationalAccess: boolean;
  subscription: CompanySubscriptionRecord | null;
  serverNowIso: string;
  billingUnavailable?: boolean;
};

export type EntitlementOptions = {
  devBypass?: boolean;
  /** Empresa isenta (conta admin da plataforma) — acesso permanente. */
  billingExempt?: boolean;
  /** Falha ao carregar billing: fail-closed operacional; UI de regularização mostra erro recuperável. */
  billingUnavailable?: boolean;
};
