import { headers } from "next/headers";

import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { assertPermission } from "@/lib/auth/require-permission";
import { getRequiredPermissionForPath } from "@/lib/auth/route-permissions";
import { requireUser } from "@/lib/auth/require-user";
import { requireCompany } from "@/features/companies/queries";

/**
 * Valida permissão da rota atual com base no pathname (via middleware header).
 */
export async function assertCurrentRoutePermission(): Promise<void> {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname");

  if (!pathname) {
    return;
  }

  if (
    pathname.startsWith("/dashboard/sem-permissao") ||
    pathname.startsWith("/dashboard/acesso-revogado")
  ) {
    return;
  }

  const permission = getRequiredPermissionForPath(pathname);

  if (!permission) {
    return;
  }

  const user = await requireUser();
  const context = await requireCompany(user.id);
  const platformAdmin = await isPlatformAdmin(user);

  if (platformAdmin) {
    return;
  }

  assertPermission(context, permission);
}
