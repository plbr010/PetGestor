import type { SubscriptionStatus } from "@/types/database.types";

export type WebhookTenantResolution =
  | {
      ok: true;
      companyId: string;
      externalReferenceMismatch: boolean;
    }
  | {
      ok: false;
      reason: "missing_local_record" | "cross_tenant";
    };

/**
 * External_reference NÃO autentica. O vínculo local (provider id → empresa)
 * prevalece. Referência adulterada para outro tenant nunca o ativa.
 */
export function resolveWebhookTenant(params: {
  localCompanyIdByProviderId: string | null;
  externalReferenceCompanyId: string | null;
  claimedCompanyId?: string | null;
}): WebhookTenantResolution {
  const localCompanyId = params.localCompanyIdByProviderId;

  if (!localCompanyId) {
    return { ok: false, reason: "missing_local_record" };
  }

  if (params.claimedCompanyId && params.claimedCompanyId !== localCompanyId) {
    return { ok: false, reason: "cross_tenant" };
  }

  return {
    ok: true,
    companyId: localCompanyId,
    externalReferenceMismatch: Boolean(
      params.externalReferenceCompanyId &&
        params.externalReferenceCompanyId !== localCompanyId,
    ),
  };
}

export function decideWebhookReplay(processingStatus: string | null | undefined): "process" | "duplicate" {
  if (!processingStatus) {
    return "process";
  }

  const normalized = processingStatus.trim().toLowerCase();
  if (normalized === "processed" || normalized === "ignored") {
    return "duplicate";
  }

  // received/failed: reprocessa (idempotente no efeito). Evita evento preso após timeout.
  return "process";
}

export function shouldApplyProviderSnapshot(params: {
  localProviderUpdatedAt: string | null | undefined;
  incomingProviderUpdatedAt: string | null | undefined;
}): boolean {
  if (!params.incomingProviderUpdatedAt || !params.localProviderUpdatedAt) {
    return true;
  }

  const incoming = new Date(params.incomingProviderUpdatedAt).getTime();
  const local = new Date(params.localProviderUpdatedAt).getTime();

  if (Number.isNaN(incoming) || Number.isNaN(local)) {
    return true;
  }

  return incoming >= local;
}

const NON_REGRESSIVE_INCOMING = new Set<SubscriptionStatus | null>([null]);

/**
 * Evento antigo pending/rejected não regride assinatura válida.
 * Cancelamento, refund e chargeback mais novos podem alterar.
 */
export function shouldApplyLocalStatusTransition(params: {
  currentLocalStatus: SubscriptionStatus | null | undefined;
  incomingLocalStatus: SubscriptionStatus | null;
  snapshotIsNewerOrEqual: boolean;
}): boolean {
  if (!params.incomingLocalStatus) {
    return false;
  }

  if (!params.snapshotIsNewerOrEqual) {
    return false;
  }

  if (
    (params.currentLocalStatus === "active" || params.currentLocalStatus === "cancelled") &&
    NON_REGRESSIVE_INCOMING.has(params.incomingLocalStatus)
  ) {
    return false;
  }

  return true;
}

export function interpretUniqueViolation(errorCode: string | null | undefined): "duplicate" | "other" {
  return errorCode === "23505" ? "duplicate" : "other";
}

export function pickLatestPayment<T extends { providerUpdatedAt: string | null; paidAt: string | null }>(
  payments: T[],
): T | null {
  if (payments.length === 0) {
    return null;
  }

  return [...payments].sort((a, b) => {
    const aMs = Date.parse(a.providerUpdatedAt ?? a.paidAt ?? "") || 0;
    const bMs = Date.parse(b.providerUpdatedAt ?? b.paidAt ?? "") || 0;
    return bMs - aMs;
  })[0] ?? null;
}

export function resolveWebhookDataId(queryDataId: string | null | undefined, bodyDataId: string | null | undefined) {
  return queryDataId || bodyDataId || null;
}

export function buildWebhookProviderEventId(params: {
  xRequestId: string | null | undefined;
  eventType: string;
  resourceId: string | null;
  action: string | null;
}): string {
  if (params.xRequestId && params.xRequestId.trim().length > 0) {
    return params.xRequestId;
  }

  return `${params.eventType}:${params.resourceId ?? "unknown"}:${params.action ?? "none"}`;
}
