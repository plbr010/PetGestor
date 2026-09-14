import "server-only";

import { revalidatePath } from "next/cache";

import { type BillingInterval } from "@/config/subscription";
import {
  getCompanySubscriptionByProviderId,
  recordBillingPayment,
  updateCompanySubscriptionBilling,
} from "@/features/subscription/billing-repository";
import {
  mapPaymentStatusToLocal,
  mapPreapprovalStatusToLocal,
  shouldCreateOrRenewPaidPeriod,
} from "@/features/subscription/provider-status";
import {
  getAuthorizedPayment,
  getPayment,
  getSubscription,
} from "@/features/subscription/providers/mercado-pago";
import {
  assertActivationMatchesPlan,
  MERCADO_PAGO_PROVIDER,
  parseExternalReference,
} from "@/features/subscription/providers/mercado-pago-types";
import { amountToCents, resolvePaidPeriodOnApprovedPayment } from "@/features/subscription/sync-policy";
import {
  resolveWebhookTenant,
  shouldApplyLocalStatusTransition,
  shouldApplyProviderSnapshot,
} from "@/features/subscription/webhook-policy";
import { getCompanySubscription } from "@/features/subscription/queries";
import { isValidUuid } from "@/lib/security/uuid";

export type SyncSubscriptionResult = {
  companyId: string;
  providerStatus: string;
  localStatus: string;
  synced: boolean;
};

function resolveBillingInterval(row: {
  billing_interval?: string | null;
  plan_code?: string | null;
}): BillingInterval {
  if (row.billing_interval === "annual" || row.plan_code === "petgestor_annual") {
    return "annual";
  }
  return "monthly";
}

function providerTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
  const existing = await getCompanySubscriptionByProviderId(providerSubscriptionId);
  const externalReferenceCompanyId = parseExternalReference(preapproval.external_reference ?? null);
  const tenant = resolveWebhookTenant({
    localCompanyIdByProviderId: existing?.company_id ?? null,
    externalReferenceCompanyId:
      externalReferenceCompanyId && isValidUuid(externalReferenceCompanyId)
        ? externalReferenceCompanyId
        : null,
    claimedCompanyId: companyId ?? null,
  });

  if (!tenant.ok) {
    throw new Error(
      tenant.reason === "cross_tenant"
        ? "billing_cross_tenant_blocked"
        : "billing_local_record_required",
    );
  }

  const resolvedCompanyId = tenant.companyId;
  const mapping = mapPreapprovalStatusToLocal(preapproval.status);
  const now = new Date();
  const incomingUpdatedAt =
    providerTimestamp(preapproval.last_modified) ?? providerTimestamp(preapproval.date_created);
  const snapshotIsNewerOrEqual = shouldApplyProviderSnapshot({
    localProviderUpdatedAt: existing?.provider_updated_at ?? null,
    incomingProviderUpdatedAt: incomingUpdatedAt,
  });

  const applyStatus = shouldApplyLocalStatusTransition({
    currentLocalStatus: existing?.status ?? null,
    incomingLocalStatus: mapping.localStatus,
    snapshotIsNewerOrEqual,
  });

  if (!snapshotIsNewerOrEqual && !applyStatus) {
    return {
      companyId: resolvedCompanyId,
      providerStatus: preapproval.status,
      localStatus: existing?.status ?? "trialing",
      synced: false,
    };
  }

  const update: Parameters<typeof updateCompanySubscriptionBilling>[1] = {
    provider: MERCADO_PAGO_PROVIDER,
    provider_subscription_id: preapproval.id,
    provider_status: preapproval.status,
    provider_checkout_url: preapproval.init_point ?? null,
    next_payment_at: preapproval.next_payment_date ?? null,
  };

  if (incomingUpdatedAt && snapshotIsNewerOrEqual) {
    update.provider_updated_at = incomingUpdatedAt;
  }

  if (applyStatus && mapping.localStatus) {
    update.status = mapping.localStatus;
  }

  if (applyStatus && mapping.localStatus === "cancelled") {
    update.cancelled_at = existing?.cancelled_at ?? now.toISOString();
    update.cancel_at_period_end = true;
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
    throw new Error("billing_local_record_required");
  }

  const paymentId = authorizedPayment.payment?.id;
  if (!paymentId) {
    return {
      companyId: local.company_id,
      paymentStatus: authorizedPayment.payment?.status ?? authorizedPayment.status ?? null,
    };
  }

  const payment = await getPayment(String(paymentId));
  const paymentStatus = payment.status;
  const paymentApprovedAt = payment.date_approved ?? null;
  const paymentAmount = payment.transaction_amount ?? null;
  const paymentCurrency = payment.currency_id ?? null;
  const paymentUpdatedAt =
    providerTimestamp(payment.date_last_updated) ??
    providerTimestamp(payment.date_approved) ??
    providerTimestamp(payment.date_created);
  const providerPaymentId = String(payment.id);
  const verifiedPaymentFetched = true;

  const paymentMapping = mapPaymentStatusToLocal(paymentStatus);
  const snapshotIsNewerOrEqual = shouldApplyProviderSnapshot({
    localProviderUpdatedAt: local.provider_updated_at ?? null,
    incomingProviderUpdatedAt: paymentUpdatedAt,
  });
  const applyStatus = shouldApplyLocalStatusTransition({
    currentLocalStatus: local.status,
    incomingLocalStatus: paymentMapping.localStatus,
    snapshotIsNewerOrEqual,
  });

  const recorded = await recordBillingPayment({
    company_id: local.company_id,
    provider: MERCADO_PAGO_PROVIDER,
    provider_payment_id: providerPaymentId,
    provider_subscription_id: preapprovalId,
    status: paymentStatus,
    amount_cents: typeof paymentAmount === "number" ? amountToCents(paymentAmount) : null,
    currency: paymentCurrency,
    provider_updated_at: paymentUpdatedAt,
    paid_at: paymentApprovedAt,
  });

  const grantsPaidPeriod = shouldCreateOrRenewPaidPeriod({
    verifiedPaymentFetched,
    paymentStatus,
  });

  if (grantsPaidPeriod) {
    assertActivationMatchesPlan({
      billingInterval: resolveBillingInterval(local),
      amount: paymentAmount,
      currency: paymentCurrency ?? "BRL",
    });
  }

  const update: Parameters<typeof updateCompanySubscriptionBilling>[1] = {
    last_payment_status: paymentStatus,
    last_payment_at: paymentApprovedAt ?? new Date().toISOString(),
  };

  if (applyStatus && paymentMapping.localStatus) {
    update.status = paymentMapping.localStatus;
  }

  if (applyStatus && grantsPaidPeriod) {
    Object.assign(
      update,
      resolvePaidPeriodOnApprovedPayment({
        billingInterval: resolveBillingInterval(local),
        now: paymentApprovedAt ? new Date(paymentApprovedAt) : new Date(),
        paymentApprovedAt: paymentApprovedAt ? new Date(paymentApprovedAt) : null,
        currentPeriodStart: local.current_period_start,
        currentPeriodEnd: local.current_period_end,
        nextPaymentAt: local.next_payment_at,
        alreadySubscribed: Boolean(local.subscribed_at),
      }),
    );
  }

  if (paymentUpdatedAt && snapshotIsNewerOrEqual) {
    update.provider_updated_at = paymentUpdatedAt;
  }

  await updateCompanySubscriptionBilling(local.company_id, update);

  revalidatePath("/assinatura");
  revalidatePath("/dashboard");

  return { companyId: local.company_id, paymentStatus, duplicate: recorded.duplicate };
}

export async function syncPaymentFromProvider(paymentId: string) {
  const payment = await getPayment(paymentId);
  const paymentMapping = mapPaymentStatusToLocal(payment.status);

  // Payment avulso não ativa: precisa do preapproval local. Evita ativar tenant via external_reference.
  return {
    paymentId: payment.id,
    paymentStatus: payment.status,
    grantsAccess: paymentMapping.grantsAccess,
  };
}
