import "server-only";

import { interpretUniqueViolation } from "@/features/subscription/webhook-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/types/database.types";

export type BillingSubscriptionUpdate = {
  status?: SubscriptionStatus;
  plan_code?: string;
  billing_interval?: "monthly" | "annual";
  offer_code?: string | null;
  provider?: string;
  provider_subscription_id?: string | null;
  provider_status?: string | null;
  provider_checkout_url?: string | null;
  checkout_started_at?: string | null;
  subscribed_at?: string | null;
  next_payment_at?: string | null;
  last_payment_at?: string | null;
  last_payment_status?: string | null;
  cancelled_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  provider_updated_at?: string | null;
  checkout_idempotency_key?: string | null;
};

const SUBSCRIPTION_COLUMNS =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end, provider_updated_at, checkout_idempotency_key";

const SUBSCRIPTION_COLUMNS_ANNUAL =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

const SUBSCRIPTION_COLUMNS_LEGACY =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

function isMissingOptionalColumnError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("billing_interval") ||
    normalized.includes("offer_code") ||
    normalized.includes("provider_updated_at") ||
    normalized.includes("checkout_idempotency_key") ||
    normalized.includes("schema cache")
  );
}

function stripOptionalColumns(update: BillingSubscriptionUpdate): BillingSubscriptionUpdate {
  const rest = { ...update };
  delete rest.billing_interval;
  delete rest.offer_code;
  delete rest.provider_updated_at;
  delete rest.checkout_idempotency_key;
  return rest;
}

function stripBloco9Columns(update: BillingSubscriptionUpdate): BillingSubscriptionUpdate {
  const rest = { ...update };
  delete rest.provider_updated_at;
  delete rest.checkout_idempotency_key;
  return rest;
}

export async function updateCompanySubscriptionBilling(
  companyId: string,
  update: BillingSubscriptionUpdate,
) {
  const admin = createSupabaseAdminClient();

  const primary = await admin
    .from("company_subscriptions")
    .update(update)
    .eq("company_id", companyId)
    .select(SUBSCRIPTION_COLUMNS)
    .maybeSingle();

  if (!primary.error && primary.data) {
    return primary.data;
  }

  const annualUpdate = stripBloco9Columns(update);
  const annual = await admin
    .from("company_subscriptions")
    .update(annualUpdate)
    .eq("company_id", companyId)
    .select(SUBSCRIPTION_COLUMNS_ANNUAL)
    .maybeSingle();

  if (!annual.error && annual.data) {
    return {
      ...annual.data,
      provider_updated_at: update.provider_updated_at ?? null,
      checkout_idempotency_key: update.checkout_idempotency_key ?? null,
    };
  }

  if (isMissingOptionalColumnError(primary.error?.message) || isMissingOptionalColumnError(annual.error?.message)) {
    const legacyUpdate = stripOptionalColumns(update);
    const legacy = await admin
      .from("company_subscriptions")
      .update(legacyUpdate)
      .eq("company_id", companyId)
      .select(SUBSCRIPTION_COLUMNS_LEGACY)
      .maybeSingle();

    if (!legacy.error && legacy.data) {
      console.warn(
        "[Billing] update sem colunas opcionais — aplique as migrations de billing no Supabase",
        {
          companyId,
          primaryError: primary.error?.message,
          annualError: annual.error?.message,
        },
      );
      return {
        ...legacy.data,
        billing_interval: update.billing_interval ?? "monthly",
        offer_code: update.offer_code ?? null,
        provider_updated_at: update.provider_updated_at ?? null,
        checkout_idempotency_key: update.checkout_idempotency_key ?? null,
      };
    }

    console.error("[Billing] subscription update failed", {
      companyId,
      primaryError: primary.error?.message,
      annualError: annual.error?.message,
      legacyError: legacy.error?.message,
    });
  } else {
    console.error("[Billing] subscription update failed", {
      companyId,
      primaryError: primary.error?.message,
      annualError: annual.error?.message,
    });
  }

  throw new Error("billing_subscription_update_failed");
}

async function selectByProviderId(providerSubscriptionId: string) {
  const admin = createSupabaseAdminClient();
  const selects = [SUBSCRIPTION_COLUMNS, SUBSCRIPTION_COLUMNS_ANNUAL, SUBSCRIPTION_COLUMNS_LEGACY];

  for (const columns of selects) {
    const result = await admin
      .from("company_subscriptions")
      .select(columns)
      .eq("provider_subscription_id", providerSubscriptionId)
      .maybeSingle();

    if (!result.error) {
      return result.data;
    }

    if (!isMissingOptionalColumnError(result.error.message)) {
      return null;
    }
  }

  return null;
}

export async function getCompanySubscriptionByProviderId(providerSubscriptionId: string) {
  const row = await selectByProviderId(providerSubscriptionId);
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;

  return {
    company_id: String(record.company_id),
    plan_code: String(record.plan_code ?? "petgestor_monthly"),
    billing_interval:
      record.billing_interval === "annual" || record.billing_interval === "monthly"
        ? record.billing_interval
        : "monthly",
    offer_code: typeof record.offer_code === "string" ? record.offer_code : null,
    status: record.status as "trialing" | "active" | "past_due" | "cancelled",
    trial_started_at: String(record.trial_started_at ?? ""),
    trial_ends_at: String(record.trial_ends_at ?? ""),
    provider: typeof record.provider === "string" ? record.provider : null,
    provider_subscription_id:
      typeof record.provider_subscription_id === "string" ? record.provider_subscription_id : null,
    provider_status: typeof record.provider_status === "string" ? record.provider_status : null,
    provider_checkout_url:
      typeof record.provider_checkout_url === "string" ? record.provider_checkout_url : null,
    checkout_started_at:
      typeof record.checkout_started_at === "string" ? record.checkout_started_at : null,
    subscribed_at: typeof record.subscribed_at === "string" ? record.subscribed_at : null,
    next_payment_at: typeof record.next_payment_at === "string" ? record.next_payment_at : null,
    last_payment_at: typeof record.last_payment_at === "string" ? record.last_payment_at : null,
    last_payment_status:
      typeof record.last_payment_status === "string" ? record.last_payment_status : null,
    cancelled_at: typeof record.cancelled_at === "string" ? record.cancelled_at : null,
    current_period_start:
      typeof record.current_period_start === "string" ? record.current_period_start : null,
    current_period_end:
      typeof record.current_period_end === "string" ? record.current_period_end : null,
    cancel_at_period_end: record.cancel_at_period_end === true,
    provider_updated_at:
      typeof record.provider_updated_at === "string" ? record.provider_updated_at : null,
    checkout_idempotency_key:
      typeof record.checkout_idempotency_key === "string" ? record.checkout_idempotency_key : null,
  };
}

export type WebhookEventRecord = {
  provider: string;
  provider_event_id: string;
  event_type: string;
  action?: string | null;
  resource_id?: string | null;
};

export async function recordWebhookEvent(event: WebhookEventRecord) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("billing_webhook_events")
    .insert({
      provider: event.provider,
      provider_event_id: event.provider_event_id,
      event_type: event.event_type,
      action: event.action ?? null,
      resource_id: event.resource_id ?? null,
      processing_status: "received",
    })
    .select("id, processing_status")
    .maybeSingle();

  if (error && interpretUniqueViolation(error.code) === "duplicate") {
    const existing = await admin
      .from("billing_webhook_events")
      .select("id, processing_status")
      .eq("provider", event.provider)
      .eq("provider_event_id", event.provider_event_id)
      .maybeSingle();

    if (existing.data?.processing_status === "processed" || existing.data?.processing_status === "ignored") {
      return { duplicate: true as const, id: existing.data.id, processingStatus: existing.data.processing_status };
    }

    return {
      duplicate: false as const,
      id: existing.data?.id ?? null,
      processingStatus: existing.data?.processing_status ?? "received",
      replay: true as const,
    };
  }

  if (error || !data) {
    throw new Error("billing_webhook_event_insert_failed");
  }

  return { duplicate: false as const, id: data.id, processingStatus: data.processing_status };
}

export async function markWebhookEventProcessed(
  eventId: string,
  status: "processed" | "failed" | "ignored",
  errorMessage?: string,
) {
  const admin = createSupabaseAdminClient();

  await admin
    .from("billing_webhook_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
    })
    .eq("id", eventId);
}

export type BillingPaymentInsert = {
  company_id: string;
  provider: string;
  provider_payment_id: string;
  provider_subscription_id?: string | null;
  status: string;
  amount_cents?: number | null;
  currency?: string | null;
  provider_updated_at?: string | null;
  paid_at?: string | null;
};

export async function recordBillingPayment(payment: BillingPaymentInsert) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("billing_payments")
    .insert({
      company_id: payment.company_id,
      provider: payment.provider,
      provider_payment_id: payment.provider_payment_id,
      provider_subscription_id: payment.provider_subscription_id ?? null,
      status: payment.status,
      amount_cents: payment.amount_cents ?? null,
      currency: payment.currency ?? null,
      provider_updated_at: payment.provider_updated_at ?? null,
      paid_at: payment.paid_at ?? null,
    })
    .select("id, company_id, provider_payment_id, status, provider_updated_at, paid_at")
    .maybeSingle();

  if (error && interpretUniqueViolation(error.code) === "duplicate") {
    const existing = await admin
      .from("billing_payments")
      .select("id, company_id, provider_payment_id, status, provider_updated_at, paid_at")
      .eq("provider", payment.provider)
      .eq("provider_payment_id", payment.provider_payment_id)
      .maybeSingle();

    return { duplicate: true as const, payment: existing.data };
  }

  if (error || !data) {
    if (isMissingOptionalColumnError(error?.message) || error?.message?.includes("billing_payments")) {
      return { duplicate: false as const, payment: null, skipped: true as const };
    }
    throw new Error("billing_payment_insert_failed");
  }

  return { duplicate: false as const, payment: data };
}

export async function listBillingPaymentsForCompany(companyId: string, limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("billing_payments")
    .select(
      "id, company_id, provider_payment_id, provider_subscription_id, status, amount_cents, currency, provider_updated_at, paid_at, created_at",
    )
    .eq("company_id", companyId)
    .order("provider_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data;
}
