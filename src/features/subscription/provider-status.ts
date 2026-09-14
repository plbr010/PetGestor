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
      // Preapproval authorized ≠ pagamento aprovado. Não libera período pago.
      return { localStatus: null, grantsAccess: false };
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
    case "authorized":
    case "pending":
    case "in_process":
    case "in_mediation":
      return { localStatus: null, grantsAccess: false };
    case "rejected":
      return { localStatus: "past_due", grantsAccess: false };
    case "cancelled":
    case "canceled":
      return { localStatus: "past_due", grantsAccess: false };
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

/**
 * Preapproval do Mercado Pago está `authorized` (cartão autorizado no provider).
 * Isso NÃO concede acesso pago no PetGestor.
 */
export function isActiveProviderSubscription(providerStatus: string | undefined | null): boolean {
  return normalizeProviderStatus(providerStatus) === "authorized";
}

/**
 * Só um payment consultado no provider (GET /v1/payments/{id}) com status
 * `approved` cria ou renova o período pago.
 */
export function shouldCreateOrRenewPaidPeriod(params: {
  verifiedPaymentFetched: boolean;
  paymentStatus: string | null | undefined;
}): boolean {
  if (!params.verifiedPaymentFetched) {
    return false;
  }

  const mapping = mapPaymentStatusToLocal(params.paymentStatus);
  return mapping.localStatus === "active" && mapping.grantsAccess;
}

export function isCancelledProviderSubscription(
  providerStatus: string | undefined | null,
): boolean {
  const normalized = normalizeProviderStatus(providerStatus);
  return normalized === "canceled" || normalized === "cancelled";
}
