"use server";

import { revalidatePath } from "next/cache";

import {
  countUnreadAppNotifications,
  listAppNotifications,
  type ListAppNotificationsFilter,
} from "@/features/app-notifications/queries";
import { syncDerivedAppNotifications } from "@/features/app-notifications/sync-derived";
import type { AppNotificationRecord } from "@/features/app-notifications/types";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppNotificationsPanelData = {
  items: AppNotificationRecord[];
  unreadCount: number;
};

function revalidateNotificationViews() {
  revalidatePath("/notificacoes");
  revalidatePath("/dashboard");
}

export async function getAppNotificationsPanelAction(): Promise<AppNotificationsPanelData> {
  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const companyId = context.membership.company.id;

  await syncDerivedAppNotifications(
    supabase,
    companyId,
    context.membership.company.timezone,
  );

  const [items, unreadCount] = await Promise.all([
    listAppNotifications(supabase, {
      companyId,
      membership: context.membership,
      limit: 12,
    }),
    countUnreadAppNotifications(supabase, {
      companyId,
      membership: context.membership,
    }),
  ]);

  return { items, unreadCount };
}

export async function getUnreadAppNotificationCountAction(): Promise<number> {
  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const companyId = context.membership.company.id;

  await syncDerivedAppNotifications(
    supabase,
    companyId,
    context.membership.company.timezone,
  );

  return countUnreadAppNotifications(supabase, {
    companyId,
    membership: context.membership,
  });
}

export async function listAppNotificationsPageAction(
  filter: ListAppNotificationsFilter = "all",
): Promise<AppNotificationRecord[]> {
  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const companyId = context.membership.company.id;

  await syncDerivedAppNotifications(
    supabase,
    companyId,
    context.membership.company.timezone,
  );

  return listAppNotifications(supabase, {
    companyId,
    membership: context.membership,
    filter,
    limit: 100,
  });
}

export async function markAppNotificationReadAction(
  notificationId: string,
): Promise<{ ok: boolean }> {
  if (!isValidUuid(notificationId)) {
    return { ok: false };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: now })
    .eq("company_id", context.membership.company.id)
    .eq("id", notificationId)
    .eq("is_read", false);

  if (error) {
    return { ok: false };
  }

  revalidateNotificationViews();
  return { ok: true };
}

export async function markAllAppNotificationsReadAction(): Promise<{ ok: boolean }> {
  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const companyId = context.membership.company.id;
  const now = new Date().toISOString();

  const items = await listAppNotifications(supabase, {
    companyId,
    membership: context.membership,
    filter: "unread",
    limit: 100,
  });

  if (items.length === 0) {
    return { ok: true };
  }

  const ids = items.map((item) => item.id);
  const { error } = await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: now })
    .eq("company_id", companyId)
    .in("id", ids);

  if (error) {
    return { ok: false };
  }

  revalidateNotificationViews();
  return { ok: true };
}
