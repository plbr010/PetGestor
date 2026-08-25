import type { Permission } from "@/lib/auth/permissions";

export const APP_NOTIFICATION_TYPES = [
  "service_order_ready",
  "stock_low",
  "stock_out",
  "appointment_assigned",
  "appointment_upcoming",
  "payment_pending",
  "payment_overdue",
  "package_expiring",
  "employee_invite_pending",
  "integration_error",
] as const;

export type AppNotificationType = (typeof APP_NOTIFICATION_TYPES)[number];

export const APP_NOTIFICATION_SEVERITIES = ["info", "success", "warning", "error"] as const;

export type AppNotificationSeverity = (typeof APP_NOTIFICATION_SEVERITIES)[number];

export type AppNotificationEntityType =
  | "appointment"
  | "service_order"
  | "product"
  | "financial_entry"
  | "customer_package"
  | "employee_invite"
  | "integration";

export type AppNotificationRecord = {
  id: string;
  companyId: string;
  userId: string | null;
  type: AppNotificationType;
  severity: AppNotificationSeverity;
  title: string;
  message: string;
  entityType: AppNotificationEntityType | null;
  entityId: string | null;
  href: string | null;
  requiredPermission: Permission | null;
  dedupeKey: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

export type CreateAppNotificationInput = {
  companyId: string;
  userId?: string | null;
  type: AppNotificationType;
  severity?: AppNotificationSeverity;
  title: string;
  message: string;
  entityType?: AppNotificationEntityType | null;
  entityId?: string | null;
  href?: string | null;
  requiredPermission?: Permission | null;
  dedupeKey: string;
};

/** Permissão mínima para ver cada tipo (além de dashboard). */
export const APP_NOTIFICATION_TYPE_PERMISSION: Partial<
  Record<AppNotificationType, Permission>
> = {
  service_order_ready: "service_orders.view",
  stock_low: "inventory.view",
  stock_out: "inventory.view",
  appointment_assigned: "appointments.view",
  appointment_upcoming: "appointments.view",
  payment_pending: "finance.view",
  payment_overdue: "finance.view",
  package_expiring: "services.view",
  employee_invite_pending: "employees.manage",
  integration_error: "subscription.manage",
};

export function canViewAppNotificationType(
  type: AppNotificationType,
  hasPermission: (permission: Permission) => boolean,
  requiredPermission: Permission | null,
): boolean {
  const needed =
    requiredPermission ?? APP_NOTIFICATION_TYPE_PERMISSION[type] ?? null;

  if (!needed) {
    return true;
  }

  return hasPermission(needed);
}

export function resolveNotificationHref(notification: {
  href: string | null;
  entityType: AppNotificationEntityType | null;
  entityId: string | null;
}): string | null {
  if (notification.href) {
    return notification.href;
  }

  if (!notification.entityType || !notification.entityId) {
    return null;
  }

  switch (notification.entityType) {
    case "appointment":
      return `/dashboard/agenda/${notification.entityId}`;
    case "service_order":
      return `/dashboard/atendimentos/${notification.entityId}`;
    case "product":
      return `/dashboard/estoque/${notification.entityId}`;
    case "financial_entry":
      return `/dashboard/financeiro/${notification.entityId}`;
    case "customer_package":
      return `/dashboard/servicos/pacotes`;
    case "employee_invite":
      return `/dashboard/funcionarios`;
    default:
      return null;
  }
}
