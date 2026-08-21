import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { SubscriptionPageContent } from "@/features/subscription/components/subscription-page-content";
import { getCompanyEntitlement, requireCompanySubscription } from "@/features/subscription/queries";
import { requireCompany } from "@/features/companies/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireUser } from "@/lib/auth/require-user";

export default async function AssinaturaPage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const platformAdmin = await isPlatformAdmin(user);

  if (!platformAdmin && !hasPermission(context.membership, "subscription.manage")) {
    redirect("/assinatura-equipe");
  }

  const subscription = await requireCompanySubscription(context.membership.company.id);
  const entitlement = await getCompanyEntitlement(context.membership.company.id);

  return (
    <>
      <DashboardHeader
        title="Assinatura"
        description="Plano, cobranças e status da sua conta"
      />
      <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
        <SubscriptionPageContent
          subscription={subscription}
          entitlement={entitlement}
          timeZone={context.membership.company.timezone}
        />
      </main>
    </>
  );
}
