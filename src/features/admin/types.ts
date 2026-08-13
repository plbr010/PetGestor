import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import type { EntitlementState } from "@/features/subscription/types";

/** Status visual do painel admin (derivado do entitlement existente). */
export type AdminAccountStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "blocked";

export type AdminAccountStatusFilter = AdminAccountStatus | "all";

export type AdminCompanyListItem = {
  companyId: string;
  companyName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  accountStatus: AdminAccountStatus;
  entitlementState: EntitlementState;
  hasOperationalAccess: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialRemainingLabel: string;
  subscribedAt: string | null;
  nextPaymentAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string | null;
  monthlyPriceCents: number;
  providerSubscriptionId: string | null;
  providerStatus: string | null;
  subscription: CompanySubscriptionRecord | null;
};

export type AdminDashboardSummary = {
  totalAccounts: number;
  trialCount: number;
  activeCount: number;
  pastDueCount: number;
  cancelledCount: number;
  blockedCount: number;
  estimatedMrrCents: number;
};

export type AdminWebhookEventSummary = {
  id: string;
  eventType: string;
  action: string | null;
  resourceId: string | null;
  receivedAt: string;
  processingStatus: string;
};

export type AdminCompanyDetail = AdminCompanyListItem & {
  timezone: string;
  planCode: string | null;
  provider: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  checkoutStartedAt: string | null;
  webhookEvents: AdminWebhookEventSummary[];
};
