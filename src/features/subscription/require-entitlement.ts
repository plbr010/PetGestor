import { redirect } from "next/navigation";

import type { CompanyEntitlement } from "@/features/subscription/types";
import { getCompanyEntitlement } from "@/features/subscription/queries";

export const SUBSCRIPTION_REQUIRED_PATH = "/assinatura";

export async function requireOperationalEntitlement(companyId: string): Promise<CompanyEntitlement> {
  const entitlement = await getCompanyEntitlement(companyId);

  if (!entitlement.hasOperationalAccess) {
    redirect(SUBSCRIPTION_REQUIRED_PATH);
  }

  return entitlement;
}

export function assertOperationalEntitlement(entitlement: CompanyEntitlement): void {
  if (!entitlement.hasOperationalAccess) {
    redirect(SUBSCRIPTION_REQUIRED_PATH);
  }
}
