import {
  PLAN_MONTHLY_PRICE_CENTS,
  PLAN_MONTHLY_PRICE_LABEL,
} from "@/config/subscription";

export const MERCADO_PAGO_PROVIDER = "mercado_pago" as const;

export const MP_API_BASE = "https://api.mercadopago.com";

export const EXTERNAL_REFERENCE_PREFIX = "petgestor_company_" as const;

export const MP_SUBSCRIPTION_REASON = "PetGestor Mensal";

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

export function getMercadoPagoTransactionAmount(): number {
  return Number((PLAN_MONTHLY_PRICE_CENTS / 100).toFixed(2));
}

export function buildMercadoPagoAutoRecurring(): MercadoPagoAutoRecurring {
  return {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: getMercadoPagoTransactionAmount(),
    currency_id: "BRL",
  };
}

export type CreatePendingPreapprovalPayload = ReturnType<
  typeof buildCreatePendingPreapprovalPayload
>;

export function buildCreatePendingPreapprovalPayload(params: {
  companyId: string;
  payerEmail: string;
  backUrl: string;
}) {
  return {
    reason: MP_SUBSCRIPTION_REASON,
    external_reference: buildExternalReference(params.companyId),
    payer_email: params.payerEmail,
    auto_recurring: buildMercadoPagoAutoRecurring(),
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

export function getPlanMarketingLabel(): string {
  return `${PLAN_MONTHLY_PRICE_LABEL}/mês`;
}
