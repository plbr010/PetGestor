import {
  ANNUAL_OFFER_CODE_LAUNCH,
  PLAN_ANNUAL_PRICE_CENTS,
  PLAN_ANNUAL_PRICE_LABEL,
  PLAN_CODES,
  PLAN_MONTHLY_PRICE_CENTS,
  PLAN_MONTHLY_PRICE_LABEL,
  planCodeForInterval,
  planDisplayName,
  priceCentsForInterval,
  type BillingInterval,
} from "@/config/subscription";

export const MERCADO_PAGO_PROVIDER = "mercado_pago" as const;

export const MP_API_BASE = "https://api.mercadopago.com";

export const EXTERNAL_REFERENCE_PREFIX = "petgestor_company_" as const;

export const MP_SUBSCRIPTION_REASON_MONTHLY = "PetGestor Mensal";
export const MP_SUBSCRIPTION_REASON_ANNUAL = "PetGestor Anual";

/** @deprecated Use MP_SUBSCRIPTION_REASON_MONTHLY */
export const MP_SUBSCRIPTION_REASON = MP_SUBSCRIPTION_REASON_MONTHLY;

export const MP_PREAPPROVAL_STATUSES = [
  "pending",
  "authorized",
  "paused",
  "canceled",
] as const;

export type MercadoPagoPreapprovalStatus = (typeof MP_PREAPPROVAL_STATUSES)[number];

export type MercadoPagoAutoRecurring = {
  frequency: number;
  frequency_type: "months";
  transaction_amount: number;
  currency_id: "BRL";
};

export type MercadoPagoPreapproval = {
  id: string;
  status: string;
  reason?: string;
  external_reference?: string;
  init_point?: string;
  back_url?: string;
  payer_email?: string;
  next_payment_date?: string;
  date_created?: string;
  auto_recurring?: MercadoPagoAutoRecurring & {
    free_trial?: unknown;
  };
};

export type MercadoPagoAuthorizedPayment = {
  id: string;
  preapproval_id?: string;
  payment?: {
    id?: string;
    status?: string;
  };
  status?: string;
};

export type MercadoPagoPayment = {
  id: string;
  status: string;
  date_approved?: string | null;
  transaction_amount?: number | null;
};

export function buildExternalReference(companyId: string): string {
  return `${EXTERNAL_REFERENCE_PREFIX}${companyId}`;
}

export function parseExternalReference(reference: string | undefined | null): string | null {
  if (!reference || !reference.startsWith(EXTERNAL_REFERENCE_PREFIX)) {
    return null;
  }

  return reference.slice(EXTERNAL_REFERENCE_PREFIX.length);
}

export function getMercadoPagoTransactionAmount(
  interval: BillingInterval = "monthly",
): number {
  return Number((priceCentsForInterval(interval) / 100).toFixed(2));
}

/**
 * Mensal: frequency 1 month × R$89,90
 * Anual: frequency 12 months × R$799,00 (cobrança anual recorrente no MP)
 */
export function buildMercadoPagoAutoRecurring(
  interval: BillingInterval = "monthly",
): MercadoPagoAutoRecurring {
  if (interval === "annual") {
    return {
      frequency: 12,
      frequency_type: "months",
      transaction_amount: getMercadoPagoTransactionAmount("annual"),
      currency_id: "BRL",
    };
  }

  return {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: getMercadoPagoTransactionAmount("monthly"),
    currency_id: "BRL",
  };
}

export function mercadoPagoReasonForInterval(interval: BillingInterval): string {
  return interval === "annual" ? MP_SUBSCRIPTION_REASON_ANNUAL : MP_SUBSCRIPTION_REASON_MONTHLY;
}

export function offerCodeForInterval(interval: BillingInterval): string | null {
  return interval === "annual" ? ANNUAL_OFFER_CODE_LAUNCH : null;
}

export type CreatePendingPreapprovalPayload = ReturnType<
  typeof buildCreatePendingPreapprovalPayload
>;

export function buildCreatePendingPreapprovalPayload(params: {
  companyId: string;
  payerEmail: string;
  backUrl: string;
  billingInterval?: BillingInterval;
}) {
  const billingInterval = params.billingInterval ?? "monthly";

  return {
    reason: mercadoPagoReasonForInterval(billingInterval),
    external_reference: buildExternalReference(params.companyId),
    payer_email: params.payerEmail,
    auto_recurring: buildMercadoPagoAutoRecurring(billingInterval),
    back_url: params.backUrl,
    status: "pending" as const,
  };
}

export function buildSanitizedPreapprovalPayloadLog(payload: CreatePendingPreapprovalPayload) {
  return {
    reason: payload.reason,
    external_reference: payload.external_reference,
    payer_email: payload.payer_email,
    auto_recurring: {
      frequency: payload.auto_recurring.frequency,
      frequency_type: payload.auto_recurring.frequency_type,
      transaction_amount: payload.auto_recurring.transaction_amount,
      currency_id: payload.auto_recurring.currency_id,
    },
    back_url: payload.back_url,
    status: payload.status,
  };
}

export function assertNoFreeTrialInPayload(payload: Record<string, unknown>): void {
  const recurring = payload.auto_recurring as Record<string, unknown> | undefined;
  if (recurring && "free_trial" in recurring) {
    throw new Error("free_trial_not_allowed");
  }
}

export function getPlanMarketingLabel(interval: BillingInterval = "monthly"): string {
  return interval === "annual"
    ? `${PLAN_ANNUAL_PRICE_LABEL}/ano`
    : `${PLAN_MONTHLY_PRICE_LABEL}/mês`;
}

export function assertExpectedCheckoutAmount(
  interval: BillingInterval,
  amount: number | null | undefined,
): void {
  const expected = getMercadoPagoTransactionAmount(interval);
  if (typeof amount !== "number" || Number(amount.toFixed(2)) !== expected) {
    throw new Error("billing_amount_mismatch");
  }
}

export {
  PLAN_CODES,
  planCodeForInterval,
  planDisplayName,
  PLAN_MONTHLY_PRICE_CENTS,
  PLAN_ANNUAL_PRICE_CENTS,
};
