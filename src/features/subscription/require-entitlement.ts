import { redirect } from "next/navigation";

import type { CompanyEntitlement } from "@/features/subscription/types";
import { getCompanyEntitlement } from "@/features/subscription/queries";
import { hasPermission, type MembershipAccess } from "@/lib/auth/permissions";

/** Dono/gestor com permissão de cobrança. */
export const SUBSCRIPTION_REQUIRED_PATH = "/assinatura";

/** Funcionário: empresa sem assinatura — sem tela de pagamento. */
export const STAFF_SUBSCRIPTION_BLOCKED_PATH = "/assinatura-equipe";

export function resolveSubscriptionBlockedPath(membership: MembershipAccess): string {
  if (hasPermission(membership, "subscription.manage")) {
    return SUBSCRIPTION_REQUIRED_PATH;
  }

  return STAFF_SUBSCRIPTION_BLOCKED_PATH;
}

export async function requireOperationalEntitlement(
  companyId: string,
  membership?: MembershipAccess,
): Promise<CompanyEntitlement> {
  const entitlement = await getCompanyEntitlement(companyId);

  if (!entitlement.hasOperationalAccess) {
    redirect(
      membership
        ? resolveSubscriptionBlockedPath(membership)
        : SUBSCRIPTION_REQUIRED_PATH,
    );
  }

  return entitlement;
}

export function assertOperationalEntitlement(
  entitlement: CompanyEntitlement,
  membership?: MembershipAccess,
): void {
  if (!entitlement.hasOperationalAccess) {
    redirect(
      membership
        ? resolveSubscriptionBlockedPath(membership)
        : SUBSCRIPTION_REQUIRED_PATH,
    );
  }
}
