import { unstable_noStore as noStore } from "next/cache";

import { computeEntitlement, mapSubscriptionRow } from "@/features/subscription/entitlement";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

const SUBSCRIPTION_SELECT =
  "company_id, plan_code, status, trial_started_at, trial_ends_at, provider, provider_subscription_id, provider_status, provider_checkout_url, checkout_started_at, subscribed_at, next_payment_at, last_payment_at, last_payment_status, cancelled_at, current_period_start, current_period_end, cancel_at_period_end";

export async function getCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRecord | null> {
  noStore();

  if (!isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("company_subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapSubscriptionRow(data);
}

export async function getCompanyEntitlement(companyId: string): Promise<CompanyEntitlement> {
  const subscription = await getCompanySubscription(companyId);
  return computeEntitlement(subscription, new Date());
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
