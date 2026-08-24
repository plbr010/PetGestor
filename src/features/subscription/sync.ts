import "server-only";

import { revalidatePath } from "next/cache";

import {
  computePaidPeriodEnd,
  type BillingInterval,
} from "@/config/subscription";
import {
  getCompanySubscriptionByProviderId,
  updateCompanySubscriptionBilling,
} from "@/features/subscription/billing-repository";
import { mapPreapprovalStatusToLocal, mapPaymentStatusToLocal } from "@/features/subscription/provider-status";
import {
  getAuthorizedPayment,
  getPayment,
  getSubscription,
} from "@/features/subscription/providers/mercado-pago";
import {
  assertExpectedCheckoutAmount,
  MERCADO_PAGO_PROVIDER,
  parseExternalReference,
} from "@/features/subscription/providers/mercado-pago-types";
import { getCompanySubscription } from "@/features/subscription/queries";
import { isValidUuid } from "@/lib/security/uuid";

export type SyncSubscriptionResult = {
  companyId: string;
  providerStatus: string;
  localStatus: string;
  synced: boolean;
};

function resolveCompanyIdFromPreapproval(
  externalReference: string | undefined,
  expectedCompanyId?: string,
): string | null {
  const companyId = parseExternalReference(externalReference ?? null);
  if (!companyId || !isValidUuid(companyId)) {
    return null;
  }

  if (expectedCompanyId && expectedCompanyId !== companyId) {
    return null;
  }

  return companyId;
}

function resolveBillingInterval(row: {
  billing_interval?: string | null;
  plan_code?: string | null;
}): BillingInterval {
  if (row.billing_interval === "annual" || row.plan_code === "petgestor_annual") {
    return "annual";
  }
  return "monthly";
}

function periodCoversAnnualCycle(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): boolean {
  if (!startIso || !endIso) {
    return false;
  }

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  return end - start >= 300 * 24 * 60 * 60 * 1000;
}

/**
 * Define período pago na primeira ativação (ou no upgrade mensal→anual).
 * Idempotente: não alonga de novo se o período anual já estiver definido.
 */
function buildPeriodUpdateOnFirstActivation(params: {
  alreadySubscribed: boolean;
  hasPeriodStart: boolean;
  currentPeriodStart: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  billingInterval: BillingInterval;
  now: Date;
  nextPaymentAt: string | null | undefined;
}): {
  subscribed_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
} {
  const existingCoversAnnual =
    params.billingInterval === "annual" &&
    periodCoversAnnualCycle(params.currentPeriodStart, params.currentPeriodEnd);

  const skipPeriodReset =
    params.hasPeriodStart &&
    (params.billingInterval === "monthly" || existingCoversAnnual);

  if (params.alreadySubscribed && skipPeriodReset) {
    return {};
  }

  const start = params.now;
  const periodEnd =
    params.billingInterval === "annual"
      ? computePaidPeriodEnd(start, "annual")
      : params.nextPaymentAt
        ? new Date(params.nextPaymentAt)
        : computePaidPeriodEnd(start, "monthly");

  const update: {
    subscribed_at?: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  } = {};

  if (!params.alreadySubscribed) {
    update.subscribed_at = start.toISOString();
  }

  if (!skipPeriodReset) {
    update.current_period_start = start.toISOString();
    update.current_period_end = periodEnd.toISOString();
    update.cancel_at_period_end = false;
  }

  return update;
}

/**
 * Em renovação, avança current_period_end só se next_payment_date for mais tarde
 * (idempotente em webhooks duplicados com a mesma data).
 */
function buildPeriodEndRefresh(params: {
  hasPeriodStart: boolean;
  currentPeriodEnd: string | null | undefined;
  nextPaymentAt: string | null | undefined;
}): { current_period_end?: string } {
  if (!params.hasPeriodStart || !params.nextPaymentAt) {
    return {};
  }

  const next = new Date(params.nextPaymentAt);
  if (Number.isNaN(next.getTime())) {
    return {};
  }

  const existingEnd = params.currentPeriodEnd ? new Date(params.currentPeriodEnd) : null;
  if (existingEnd && next.getTime() <= existingEnd.getTime()) {
    return {};
  }

  return { current_period_end: next.toISOString() };
}

export async function syncSubscriptionFromProvider(params: {
  companyId?: string;
  providerSubscriptionId?: string;
}): Promise<SyncSubscriptionResult | null> {
  let providerSubscriptionId = params.providerSubscriptionId;
  const companyId = params.companyId;

  if (!providerSubscriptionId && companyId) {
    const local = await getCompanySubscription(companyId);
    providerSubscriptionId = local?.providerSubscriptionId ?? undefined;
  }

  if (!providerSubscriptionId) {
    return null;
  }

  const preapproval = await getSubscription(providerSubscriptionId);
  const resolvedCompanyId =
    companyId ?? resolveCompanyIdFromPreapproval(preapproval.external_reference);

  if (!resolvedCompanyId) {
    throw new Error("billing_external_reference_mismatch");
  }

  if (companyId && companyId !== resolvedCompanyId) {
    throw new Error("billing_company_mismatch");
  }

  const existing = await getCompanySubscriptionByProviderId(providerSubscriptionId);
  if (existing && existing.company_id !== resolvedCompanyId) {
    throw new Error("billing_cross_tenant_blocked");
  }

  const mapping = mapPreapprovalStatusToLocal(preapproval.status);
  const now = new Date();
  const billingInterval = resolveBillingInterval(existing ?? {});

  const mpAmount = preapproval.auto_recurring?.transaction_amount;
  if (typeof mpAmount === "number" && mapping.localStatus === "active") {
    assertExpectedCheckoutAmount(billingInterval, mpAmount);
  }

  const update: Parameters<typeof updateCompanySubscriptionBilling>[1] = {
    provider: MERCADO_PAGO_PROVIDER,
    provider_subscription_id: preapproval.id,
    provider_status: preapproval.status,
    provider_checkout_url: preapproval.init_point ?? null,
    next_payment_at: preapproval.next_payment_date ?? null,
  };

  if (mapping.localStatus) {
    update.status = mapping.localStatus;
  }

  if (mapping.localStatus === "active") {
    Object.assign(
      update,
      buildPeriodUpdateOnFirstActivation({
        alreadySubscribed: Boolean(existing?.subscribed_at),
        hasPeriodStart: Boolean(existing?.current_period_start),
        currentPeriodStart: existing?.current_period_start,
        currentPeriodEnd: existing?.current_period_end,
        billingInterval,
        now,
        nextPaymentAt: preapproval.next_payment_date,
      }),
      buildPeriodEndRefresh({
        hasPeriodStart: Boolean(existing?.current_period_start),
        currentPeriodEnd: existing?.current_period_end,
        nextPaymentAt: preapproval.next_payment_date,
      }),
    );
  }

  if (mapping.localStatus === "cancelled") {
    update.cancelled_at = existing?.cancelled_at ?? now.toISOString();
    update.cancel_at_period_end = true;

    // Garante período já pago para não cortar acesso anual/mensal no meio do ciclo.
    if (!existing?.current_period_end) {
      const startIso = existing?.subscribed_at ?? existing?.current_period_start ?? now.toISOString();
      const start = new Date(startIso);
      const endFromNext = preapproval.next_payment_date
        ? new Date(preapproval.next_payment_date)
        : computePaidPeriodEnd(start, billingInterval);
      update.current_period_start = existing?.current_period_start ?? start.toISOString();
      update.current_period_end = endFromNext.toISOString();
    }
  }

  const row = await updateCompanySubscriptionBilling(resolvedCompanyId, update);

  revalidatePath("/assinatura");
  revalidatePath("/assinatura/retorno");
  revalidatePath("/dashboard");

  return {
    companyId: resolvedCompanyId,
    providerStatus: preapproval.status,
    localStatus: row.status,
    synced: true,
  };
}

export async function syncAuthorizedPaymentFromProvider(authorizedPaymentId: string) {
  const authorizedPayment = await getAuthorizedPayment(authorizedPaymentId);
  const preapprovalId = authorizedPayment.preapproval_id;

  if (!preapprovalId) {
    return null;
  }

  await syncSubscriptionFromProvider({ providerSubscriptionId: preapprovalId });

  const local = await getCompanySubscriptionByProviderId(preapprovalId);
  if (!local) {
    return null;
  }

  let paymentStatus: string | undefined;
  let paymentApprovedAt: string | null = null;

  const paymentId = authorizedPayment.payment?.id;
  if (paymentId) {
    const payment = await getPayment(String(paymentId));
    paymentStatus = payment.status;
    paymentApprovedAt = payment.date_approved ?? null;
  } else if (authorizedPayment.payment?.status) {
    paymentStatus = authorizedPayment.payment.status;
  } else if (authorizedPayment.status) {
    paymentStatus = authorizedPayment.status;
  }

  if (!paymentStatus) {
    return null;
  }

  const paymentMapping = mapPaymentStatusToLocal(paymentStatus);
  const update: Parameters<typeof updateCompanySubscriptionBilling>[1] = {
    last_payment_status: paymentStatus,
    last_payment_at: paymentApprovedAt ?? new Date().toISOString(),
  };

  if (paymentMapping.localStatus) {
    update.status = paymentMapping.localStatus;
  }

  // Pagamento aprovado: define/renova período (inclui upgrade mensal→anual).
  if (paymentMapping.localStatus === "active") {
    const interval = resolveBillingInterval(local);
    const start = paymentApprovedAt ? new Date(paymentApprovedAt) : new Date();
    const coversAnnual = periodCoversAnnualCycle(
      local.current_period_start,
      local.current_period_end,
    );

    if (!local.current_period_start || (interval === "annual" && !coversAnnual)) {
      update.current_period_start = start.toISOString();
      update.current_period_end = computePaidPeriodEnd(start, interval).toISOString();
      update.cancel_at_period_end = false;
    }

    if (!local.subscribed_at) {
      update.subscribed_at = start.toISOString();
    }
  }

  await updateCompanySubscriptionBilling(local.company_id, update);

  revalidatePath("/assinatura");
  revalidatePath("/dashboard");

  return { companyId: local.company_id, paymentStatus };
}

export async function syncPaymentFromProvider(paymentId: string) {
  const payment = await getPayment(paymentId);
  const paymentMapping = mapPaymentStatusToLocal(payment.status);

  // Payment webhooks alone cannot activate without linked preapproval context.
  return {
    paymentId: payment.id,
    paymentStatus: payment.status,
    grantsAccess: paymentMapping.grantsAccess,
  };
}
