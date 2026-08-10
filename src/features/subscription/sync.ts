import "server-only";

import { revalidatePath } from "next/cache";

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
  const nowIso = new Date().toISOString();

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

  if (mapping.localStatus === "active" && !existing?.subscribed_at) {
    update.subscribed_at = nowIso;
  }

  if (mapping.localStatus === "cancelled") {
    update.cancelled_at = existing?.cancelled_at ?? nowIso;
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

  await updateCompanySubscriptionBilling(local.company_id, update);

  revalidatePath("/assinatura");
  revalidatePath("/dashboard");

  return { companyId: local.company_id, paymentStatus };
}

export async function syncPaymentFromProvider(paymentId: string) {
  const payment = await getPayment(paymentId);
  const paymentMapping = mapPaymentStatusToLocal(payment.status);

  // Payment webhooks alone cannot activate without linked preapproval context.
  // Conservative: only update last payment fields when we can resolve company via existing sync flows.
  return {
    paymentId: payment.id,
    paymentStatus: payment.status,
    grantsAccess: paymentMapping.grantsAccess,
  };
}
