import { redirect } from "next/navigation";

import type { DashboardContext } from "@/features/auth/types";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  hasActiveAccess,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";

export class PermissionDeniedError extends Error {
  constructor(message = "permission_denied") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export function assertActiveAccess(context: DashboardContext): void {
  if (!hasActiveAccess(context.membership)) {
    redirect("/dashboard/acesso-revogado");
  }
}

export function assertPermission(context: DashboardContext, permission: Permission): void {
  assertActiveAccess(context);

  if (!hasPermission(context.membership, permission)) {
    redirect("/dashboard/sem-permissao");
  }
}

export function assertAnyPermission(
  context: DashboardContext,
  permissions: Permission[],
): void {
  assertActiveAccess(context);

  if (!hasAnyPermission(context.membership, permissions)) {
    redirect("/dashboard/sem-permissao");
  }
}

export function assertAllPermissions(
  context: DashboardContext,
  permissions: Permission[],
): void {
  assertActiveAccess(context);

  if (!hasAllPermissions(context.membership, permissions)) {
    redirect("/dashboard/sem-permissao");
  }
}

export async function requirePermission(permission: Permission): Promise<DashboardContext> {
  const context = await requireCompanyContext();
  assertPermission(context, permission);
  return context;
}

export async function requireAnyPermission(
  permissions: Permission[],
): Promise<DashboardContext> {
  const context = await requireCompanyContext();
  assertAnyPermission(context, permissions);
  return context;
}

export function checkPermission(context: DashboardContext, permission: Permission): boolean {
  if (!hasActiveAccess(context.membership)) {
    return false;
  }

  return hasPermission(context.membership, permission);
}

export function denyPermissionAction(): { error: string } {
  return { error: "Você não tem permissão para realizar esta ação." };
}

export function assertPermissionForAction(
  context: DashboardContext,
  permission: Permission,
): { error: string } | null {
  if (!hasActiveAccess(context.membership)) {
    return { error: "Seu acesso a esta empresa foi removido." };
  }

  if (!hasPermission(context.membership, permission)) {
    return denyPermissionAction();
  }

  return null;
}
