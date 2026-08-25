import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  APP_NOTIFICATION_TYPES,
  canViewAppNotificationType,
  resolveNotificationHref,
  type AppNotificationEntityType,
  type AppNotificationRecord,
  type AppNotificationSeverity,
  type AppNotificationType,
} from "@/features/app-notifications/types";
import type { MembershipAccess, Permission } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

type NotificationRow = Database["public"]["Tables"]["app_notifications"]["Row"];

function isAppNotificationType(value: string): value is AppNotificationType {
  return (APP_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function mapRow(row: NotificationRow): AppNotificationRecord | null {
  if (!isAppNotificationType(row.type)) {
    return null;
  }

  const severity = row.severity as AppNotificationSeverity;
  const requiredPermission =
    (row.required_permission as Permission | null) ?? null;

  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    type: row.type,
    severity,
    title: row.title,
    message: row.message,
    entityType: (row.entity_type as AppNotificationEntityType | null) ?? null,
    entityId: row.entity_id,
    href: resolveNotificationHref({
      href: row.href,
      entityType: (row.entity_type as AppNotificationEntityType | null) ?? null,
      entityId: row.entity_id,
    }),
    requiredPermission,
    dedupeKey: row.dedupe_key,
    isRead: row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function filterForMembership(
  items: AppNotificationRecord[],
  membership: MembershipAccess,
): AppNotificationRecord[] {
  return items.filter((item) =>
    canViewAppNotificationType(
      item.type,
      (permission) => hasPermission(membership, permission),
      item.requiredPermission,
    ),
  );
}

export type ListAppNotificationsFilter = "all" | "unread" | "read";

export async function listAppNotifications(
  supabase: DbClient,
  input: {
    companyId: string;
    membership: MembershipAccess;
    filter?: ListAppNotificationsFilter;
    limit?: number;
  },
): Promise<AppNotificationRecord[]> {
  const limit = input.limit ?? 50;
  let query = supabase
    .from("app_notifications")
    .select("*")
    .eq("company_id", input.companyId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 3, 150));

  if (input.filter === "unread") {
    query = query.eq("is_read", false);
  } else if (input.filter === "read") {
    query = query.eq("is_read", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[app-notifications:list]", error.message);
    return [];
  }

  const mapped = (data ?? [])
    .map((row) => mapRow(row))
    .filter((row): row is AppNotificationRecord => row !== null);

  return filterForMembership(mapped, input.membership).slice(0, limit);
}

export async function countUnreadAppNotifications(
  supabase: DbClient,
  input: {
    companyId: string;
    membership: MembershipAccess;
  },
): Promise<number> {
  const items = await listAppNotifications(supabase, {
    companyId: input.companyId,
    membership: input.membership,
    filter: "unread",
    limit: 100,
  });
  return items.length;
}
