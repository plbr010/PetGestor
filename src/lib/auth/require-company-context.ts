import { requireUser } from "@/lib/auth/require-user";
import { requireCompany } from "@/features/companies/queries";
import { requireOperationalEntitlement } from "@/features/subscription/require-entitlement";
import type { DashboardContext } from "@/features/auth/types";

export async function requireCompanyContext(): Promise<DashboardContext> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  await requireOperationalEntitlement(context.membership.company.id);
  return context;
}

/** Contexto autenticado com empresa, sem exigir entitlement (billing/assinatura). */
export async function requireCompanyBillingContext(): Promise<DashboardContext> {
  const user = await requireUser();
  return requireCompany(user.id);
}
