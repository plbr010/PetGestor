import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionPageContent } from "@/features/subscription/components/subscription-page-content";
import {
  BillingUnavailableError,
  getCompanyEntitlement,
  requireCompanySubscription,
} from "@/features/subscription/queries";
import { requireCompany } from "@/features/companies/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "next/navigation";

export default async function AssinaturaPage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const platformAdmin = await isPlatformAdmin(user);

  if (!platformAdmin && !hasPermission(context.membership, "subscription.manage")) {
    redirect("/assinatura-equipe");
  }

  let loadError: "unavailable" | "missing" | null = null;
  let subscription = null;
  let entitlement = null;

  try {
    subscription = await requireCompanySubscription(context.membership.company.id);
    entitlement = await getCompanyEntitlement(context.membership.company.id);
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      loadError = "unavailable";
    } else if (error instanceof Error && error.message === "subscription_not_found") {
      loadError = "missing";
    } else {
      throw error;
    }
  }

  if (loadError || !subscription || !entitlement) {
    return (
      <>
        <DashboardHeader
          title="Assinatura"
          description="Plano, cobranças e status da sua conta"
        />
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
          <Card className="mx-auto max-w-3xl">
            <CardHeader>
              <CardTitle>Não foi possível carregar a assinatura</CardTitle>
              <CardDescription>
                O billing está temporariamente indisponível. Não liberamos o painel automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ButtonLink href="/assinatura" className="h-11 w-full">
                Tentar novamente
              </ButtonLink>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

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
