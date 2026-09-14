import { unstable_noStore as noStore } from "next/cache";

import { computeEntitlement, mapSubscriptionRow } from "@/features/subscription/entitlement";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

const SUBSCRIPTION_SELECT =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end, provider_updated_at, checkout_idempotency_key";

const SUBSCRIPTION_SELECT_ANNUAL =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

/** Fallback se a migration anual ainda não foi aplicada no projeto Supabase. */
const SUBSCRIPTION_SELECT_LEGACY =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

function asSubscriptionRow(data: unknown): Parameters<typeof mapSubscriptionRow>[0] | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (typeof row.company_id !== "string" || typeof row.status !== "string") {
    return null;
  }

  return data as Parameters<typeof mapSubscriptionRow>[0];
}

export class BillingUnavailableError extends Error {
  constructor(message = "billing_unavailable") {
    super(message);
    this.name = "BillingUnavailableError";
  }
}

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

async function selectSubscriptionRow(companyId: string) {
  const supabase = await createSupabaseServerClient();
  const selects = [SUBSCRIPTION_SELECT, SUBSCRIPTION_SELECT_ANNUAL, SUBSCRIPTION_SELECT_LEGACY];

  let lastError: { message?: string } | null = null;

  for (const columns of selects) {
    const result = await supabase
      .from("company_subscriptions")
      .select(columns)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!result.error) {
      return { data: result.data, unavailable: false as const };
    }

    lastError = result.error;
    if (!isMissingOptionalColumnError(result.error.message)) {
      return { data: null, unavailable: true as const };
    }
  }

  if (lastError) {
    return { data: null, unavailable: true as const };
  }

  return { data: null, unavailable: false as const };
}

export async function getCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRecord | null> {
  noStore();

  if (!isValidUuid(companyId)) {
    return null;
  }

  const loaded = await selectSubscriptionRow(companyId);
  if (loaded.unavailable) {
    throw new BillingUnavailableError();
  }

  if (!loaded.data) {
    return null;
  }

  const row = asSubscriptionRow(loaded.data);
  if (!row) {
    return null;
  }

  return mapSubscriptionRow(row);
}

export async function getCompanyEntitlement(companyId: string): Promise<CompanyEntitlement> {
  try {
    const subscription = await getCompanySubscription(companyId);

    if (!isValidUuid(companyId)) {
      return computeEntitlement(subscription, new Date());
    }

    const supabase = await createSupabaseServerClient();
    const { data: company, error } = await supabase
      .from("companies")
      .select("billing_exempt")
      .eq("id", companyId)
      .maybeSingle();

    // Coluna ainda não migrada → trata como não isenta (fail-closed para isenção).
    if (error) {
      return computeEntitlement(subscription, new Date());
    }

    return computeEntitlement(subscription, new Date(), {
      billingExempt: Boolean(company?.billing_exempt),
    });
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      return computeEntitlement(null, new Date(), { billingUnavailable: true });
    }
    throw error;
  }
}

export async function requireCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRecord> {
  const subscription = await getCompanySubscription(companyId);

  if (!subscription) {
    throw new Error("subscription_not_found");
  }

  return subscription;
}
