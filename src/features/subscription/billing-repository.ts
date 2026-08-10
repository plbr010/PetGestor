import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/types/database.types";

export type BillingSubscriptionUpdate = {
  status?: SubscriptionStatus;
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
};

const SUBSCRIPTION_COLUMNS =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

export async function updateCompanySubscriptionBilling(
  companyId: string,
  update: BillingSubscriptionUpdate,
) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("company_subscriptions")
    .update(update)
    .eq("company_id", companyId)
    .select(SUBSCRIPTION_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    throw new Error("billing_subscription_update_failed");
  }

  return data;
}

export async function getCompanySubscriptionByProviderId(providerSubscriptionId: string) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("company_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
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
