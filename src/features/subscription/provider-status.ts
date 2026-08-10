import type { SubscriptionStatus } from "@/types/database.types";
import type { MercadoPagoPreapprovalStatus } from "@/features/subscription/providers/mercado-pago-types";

export type ProviderStatusMapping = {
  localStatus: SubscriptionStatus | null;
  grantsAccess: boolean;
};

export function normalizeProviderStatus(status: string | undefined | null): string {
  return (status ?? "").trim().toLowerCase();
}

export function mapPreapprovalStatusToLocal(
  providerStatus: string | undefined | null,
): ProviderStatusMapping {
  const normalized = normalizeProviderStatus(providerStatus);

  switch (normalized as MercadoPagoPreapprovalStatus | string) {
    case "authorized":
      return { localStatus: "active", grantsAccess: true };
    case "pending":
      return { localStatus: null, grantsAccess: false };
    case "paused":
      return { localStatus: "past_due", grantsAccess: false };
    case "canceled":
    case "cancelled":
      return { localStatus: "cancelled", grantsAccess: false };
    default:
      return { localStatus: null, grantsAccess: false };
  }
}

export function mapPaymentStatusToLocal(
  paymentStatus: string | undefined | null,
): ProviderStatusMapping {
  const normalized = normalizeProviderStatus(paymentStatus);

  switch (normalized) {
    case "approved":
      return { localStatus: "active", grantsAccess: true };
    case "pending":
    case "in_process":
    case "in_mediation":
      return { localStatus: null, grantsAccess: false };
    case "rejected":
    case "cancelled":
    case "refunded":
    case "charged_back":
      return { localStatus: "past_due", grantsAccess: false };
    default:
      return { localStatus: null, grantsAccess: false };
  }
}

export function isReusablePendingCheckout(providerStatus: string | undefined | null): boolean {
  return normalizeProviderStatus(providerStatus) === "pending";
}

export function isActiveProviderSubscription(providerStatus: string | undefined | null): boolean {
  return normalizeProviderStatus(providerStatus) === "authorized";
}

export function isCancelledProviderSubscription(
  providerStatus: string | undefined | null,
): boolean {
  const normalized = normalizeProviderStatus(providerStatus);
  return normalized === "canceled" || normalized === "cancelled";
}
