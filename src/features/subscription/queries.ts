import { unstable_noStore as noStore } from "next/cache";

import { computeEntitlement, mapSubscriptionRow } from "@/features/subscription/entitlement";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

const SUBSCRIPTION_SELECT =
  "company_id, plan_code, billing_interval, offer_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

/** Fallback se a migration anual ainda não foi aplicada no projeto Supabase. */
const SUBSCRIPTION_SELECT_LEGACY =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

export async function getCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRecord | null> {
  noStore();

  if (!isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const primary = await supabase
    .from("company_subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!primary.error && primary.data) {
    return mapSubscriptionRow(primary.data);
  }

  // Colunas billing_interval/offer_code ausentes → trata como mensal via plan_code.
  const legacy = await supabase
    .from("company_subscriptions")
    .select(SUBSCRIPTION_SELECT_LEGACY)
    .eq("company_id", companyId)
    .maybeSingle();

  if (legacy.error || !legacy.data) {
    return null;
  }

  return mapSubscriptionRow(legacy.data);
}

export async function getCompanyEntitlement(companyId: string): Promise<CompanyEntitlement> {
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

  // Coluna ainda não migrada → trata como não isenta.
  if (error) {
    return computeEntitlement(subscription, new Date());
  }

  return computeEntitlement(subscription, new Date(), {
    billingExempt: Boolean(company?.billing_exempt),
  });
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
