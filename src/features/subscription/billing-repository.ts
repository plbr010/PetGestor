import "server-only";

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
};

const SUBSCRIPTION_COLUMNS =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

const SUBSCRIPTION_COLUMNS_LEGACY =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

function isMissingAnnualColumnError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("billing_interval") ||
    normalized.includes("offer_code") ||
    normalized.includes("schema cache")
  );
}

function stripAnnualColumns(update: BillingSubscriptionUpdate): BillingSubscriptionUpdate {
  const rest = { ...update };
  delete rest.billing_interval;
  delete rest.offer_code;
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

  const shouldRetryWithoutAnnualColumns =
    Boolean(update.billing_interval || update.offer_code !== undefined) ||
    isMissingAnnualColumnError(primary.error?.message);

  // Migration anual ainda não aplicada: grava o restante sem billing_interval/offer_code.
  if (shouldRetryWithoutAnnualColumns) {
    const legacyUpdate = stripAnnualColumns(update);
    const legacy = await admin
      .from("company_subscriptions")
      .update(legacyUpdate)
      .eq("company_id", companyId)
      .select(SUBSCRIPTION_COLUMNS_LEGACY)
      .maybeSingle();

    if (!legacy.error && legacy.data) {
      console.warn(
        "[Billing] update sem colunas anuais — aplique docs/sql/APPLY-annual-subscription-plan.sql",
        {
          companyId,
          primaryError: primary.error?.message,
        },
      );
      return {
        ...legacy.data,
        billing_interval: update.billing_interval ?? "monthly",
        offer_code: update.offer_code ?? null,
      };
    }

    console.error("[Billing] subscription update failed", {
      companyId,
      primaryError: primary.error?.message,
      legacyError: legacy.error?.message,
    });
  } else {
    console.error("[Billing] subscription update failed", {
      companyId,
      primaryError: primary.error?.message,
    });
  }

  throw new Error("billing_subscription_update_failed");
}

export async function getCompanySubscriptionByProviderId(providerSubscriptionId: string) {
  const admin = createSupabaseAdminClient();

  const primary = await admin
    .from("company_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (!primary.error) {
    return primary.data;
  }

  const legacy = await admin
    .from("company_subscriptions")
    .select(SUBSCRIPTION_COLUMNS_LEGACY)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (legacy.error || !legacy.data) {
    return null;
  }

  return {
    ...legacy.data,
    billing_interval: "monthly" as const,
    offer_code: null,
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
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    return { duplicate: true as const, id: null };
  }

  if (error || !data) {
    throw new Error("billing_webhook_event_insert_failed");
  }

  return { duplicate: false as const, id: data.id };
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
