import { requireUser } from "@/lib/auth/require-user";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireCompany } from "@/features/companies/queries";
import { requireOperationalEntitlement } from "@/features/subscription/require-entitlement";
import type { DashboardContext } from "@/features/auth/types";

export async function requireCompanyContext(): Promise<DashboardContext> {
  const user = await requireUser();
  const context = await requireCompany(user.id);

  if (!(await isPlatformAdmin(user))) {
    await requireOperationalEntitlement(context.membership.company.id);
  }

  return context;
}

/** Contexto autenticado com empresa, sem exigir entitlement (billing/assinatura). */
export async function requireCompanyBillingContext(): Promise<DashboardContext> {
  const user = await requireUser();
  return requireCompany(user.id);
}
