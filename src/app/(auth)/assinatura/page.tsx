import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { SubscriptionPageContent } from "@/features/subscription/components/subscription-page-content";
import { getCompanyEntitlement, requireCompanySubscription } from "@/features/subscription/queries";
import { requireCompany } from "@/features/companies/queries";
import { requireUser } from "@/lib/auth/require-user";

export default async function AssinaturaPage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const subscription = await requireCompanySubscription(context.membership.company.id);
  const entitlement = await getCompanyEntitlement(context.membership.company.id);

  if (entitlement.hasOperationalAccess && subscription.status === "active") {
    redirect("/dashboard");
  }

  return (
    <AuthShell>
      <SubscriptionPageContent
        subscription={subscription}
        entitlement={entitlement}
        timeZone={context.membership.company.timezone}
      />
    </AuthShell>
  );
}
