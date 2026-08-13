import "server-only";

import { PLAN_MONTHLY_PRICE_CENTS } from "@/config/subscription";
import type {
  AdminAccountStatusFilter,
  AdminCompanyDetail,
  AdminCompanyListItem,
  AdminDashboardSummary,
  AdminWebhookEventSummary,
} from "@/features/admin/types";
import {
  buildAdminSummary,
  formatAdminTrialRemaining,
  mapEntitlementToAdminStatus,
  matchesAdminFilters,
} from "@/features/admin/utils";
import { computeEntitlement, mapSubscriptionRow } from "@/features/subscription/entitlement";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/types/database.types";

type CompanyMemberJoin = {
  user_id: string;
  role: string;
};

type CompanyAdminRow = {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
  created_by: string;
  company_subscriptions: SubscriptionJoin | SubscriptionJoin[] | null;
  company_members: CompanyMemberJoin[] | null;
};

type SubscriptionJoin = {
  company_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  trial_started_at: string;
  trial_ends_at: string;
  provider: string | null;
  provider_subscription_id: string | null;
  provider_status: string | null;
  provider_checkout_url: string | null;
  checkout_started_at: string | null;
  subscribed_at: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
  last_payment_status: string | null;
  cancelled_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

function unwrapSubscription(
  value: SubscriptionJoin | SubscriptionJoin[] | null,
): SubscriptionJoin | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function pickOwner(members: CompanyMemberJoin[] | null): CompanyMemberJoin | null {
  if (!members || members.length === 0) {
    return null;
  }

  const owner = members.find((member) => member.role === "owner");
  return owner ?? members[0] ?? null;
}

async function loadUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();

  if (uniqueIds.length === 0) {
    return map;
  }

  const admin = createSupabaseAdminClient();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error || !data?.users?.length) {
      break;
    }

    for (const user of data.users) {
      if (user.email && uniqueIds.includes(user.id)) {
        map.set(user.id, user.email);
      }
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
    if (page > 50) {
      break;
    }
  }

  return map;
}

function toListItem(
  row: CompanyAdminRow,
  emailMap: Map<string, string>,
  nameMap: Map<string, string>,
  phoneMap: Map<string, string>,
  serverNow: Date,
): AdminCompanyListItem {
  const subscriptionRow = unwrapSubscription(row.company_subscriptions);
  const subscription: CompanySubscriptionRecord | null = subscriptionRow
    ? mapSubscriptionRow(subscriptionRow)
    : null;
  const entitlement = computeEntitlement(subscription, serverNow, { devBypass: false });
  const accountStatus = mapEntitlementToAdminStatus(entitlement.state);
  const owner = pickOwner(row.company_members);

  return {
    companyId: row.id,
    companyName: row.name,
    ownerName: owner ? (nameMap.get(owner.user_id) ?? null) : null,
    ownerEmail: owner ? (emailMap.get(owner.user_id) ?? null) : null,
    ownerPhone: owner ? (phoneMap.get(owner.user_id) ?? null) : null,
    createdAt: row.created_at,
    accountStatus,
    entitlementState: entitlement.state,
    hasOperationalAccess: entitlement.hasOperationalAccess,
    trialStartedAt: subscription?.trialStartedAt ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    trialRemainingLabel: subscription
      ? formatAdminTrialRemaining(subscription.trialEndsAt, serverNow)
      : "—",
    subscribedAt: subscription?.subscribedAt ?? null,
    nextPaymentAt: subscription?.nextPaymentAt ?? null,
    lastPaymentAt: subscription?.lastPaymentAt ?? null,
    lastPaymentStatus: subscription?.lastPaymentStatus ?? null,
    monthlyPriceCents: PLAN_MONTHLY_PRICE_CENTS,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    providerStatus: subscription?.providerStatus ?? null,
    subscription,
  };
}

function matchesFilters(
  item: AdminCompanyListItem,
  query: string,
  status: AdminAccountStatusFilter,
): boolean {
  return matchesAdminFilters(item, query, status);
}

export { buildAdminSummary } from "@/features/admin/utils";

async function loadProfileContactMaps(
  userIds: string[],
): Promise<{ nameMap: Map<string, string>; phoneMap: Map<string, string> }> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const nameMap = new Map<string, string>();
  const phoneMap = new Map<string, string>();

  if (uniqueIds.length === 0) {
    return { nameMap, phoneMap };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", uniqueIds);

  if (error || !data) {
    return { nameMap, phoneMap };
  }

  for (const profile of data) {
    nameMap.set(profile.id, profile.full_name);
    if (profile.phone) {
      phoneMap.set(profile.id, profile.phone);
    }
  }

  return { nameMap, phoneMap };
}

async function fetchCompanyAdminRows(companyId?: string): Promise<CompanyAdminRow[]> {
  const admin = createSupabaseAdminClient();

  let query = admin.from("companies").select(
    `
      id,
      name,
      timezone,
      created_at,
      created_by,
      company_subscriptions (
        company_id,
        plan_code,
        status,
        trial_started_at,
        trial_ends_at,
        provider,
        provider_subscription_id,
        provider_status,
        provider_checkout_url,
        checkout_started_at,
        subscribed_at,
        next_payment_at,
        last_payment_at,
        last_payment_status,
        cancelled_at,
        current_period_start,
        current_period_end,
        cancel_at_period_end
      ),
      company_members (
        user_id,
        role
      )
    `,
  );

  if (companyId) {
    query = query.eq("id", companyId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as unknown as CompanyAdminRow[];
}

export async function listAdminCompanies(options: {
  query?: string;
  status?: AdminAccountStatusFilter;
  serverNow?: Date;
} = {}): Promise<{ items: AdminCompanyListItem[]; summary: AdminDashboardSummary }> {
  const serverNow = options.serverNow ?? new Date();
  const rows = await fetchCompanyAdminRows();
  const ownerIds = rows
    .map((row) => pickOwner(row.company_members)?.user_id)
    .filter((id): id is string => Boolean(id));
  const [emailMap, contactMaps] = await Promise.all([
    loadUserEmailMap(ownerIds),
    loadProfileContactMaps(ownerIds),
  ]);

  const allItems = rows.map((row) =>
    toListItem(row, emailMap, contactMaps.nameMap, contactMaps.phoneMap, serverNow),
  );
  const summary = buildAdminSummary(allItems);
  const items = allItems.filter((item) =>
    matchesFilters(item, options.query ?? "", options.status ?? "all"),
  );

  return { items, summary };
}

async function listWebhookEventsForSubscription(
  providerSubscriptionId: string | null,
): Promise<AdminWebhookEventSummary[]> {
  if (!providerSubscriptionId) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("billing_webhook_events")
    .select("id, event_type, action, resource_id, received_at, processing_status")
    .eq("resource_id", providerSubscriptionId)
    .order("received_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    action: event.action,
    resourceId: event.resource_id,
    receivedAt: event.received_at,
    processingStatus: event.processing_status,
  }));
}

export async function getAdminCompanyDetail(
  companyId: string,
  serverNow: Date = new Date(),
): Promise<AdminCompanyDetail | null> {
  if (!isValidUuid(companyId)) {
    return null;
  }

  const rows = await fetchCompanyAdminRows(companyId);
  const row = rows[0];

  if (!row) {
    return null;
  }

  const owner = pickOwner(row.company_members);
  const ownerIds = owner ? [owner.user_id] : [];
  const [emailMap, contactMaps] = await Promise.all([
    loadUserEmailMap(ownerIds),
    loadProfileContactMaps(ownerIds),
  ]);
  const item = toListItem(
    row,
    emailMap,
    contactMaps.nameMap,
    contactMaps.phoneMap,
    serverNow,
  );
  const subscription = item.subscription;
  const webhookEvents = await listWebhookEventsForSubscription(
    item.providerSubscriptionId,
  );

  return {
    ...item,
    timezone: row.timezone,
    planCode: subscription?.planCode ?? null,
    provider: subscription?.provider ?? null,
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    cancelledAt: subscription?.cancelledAt ?? null,
    checkoutStartedAt: subscription?.checkoutStartedAt ?? null,
    webhookEvents,
  };
}
