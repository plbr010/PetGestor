import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardUserProvider } from "@/components/layout/dashboard-user-provider";
import { OnboardingTourOverlay } from "@/features/onboarding-tour/components/onboarding-tour-overlay";
import { OnboardingTourProvider } from "@/features/onboarding-tour/onboarding-tour-provider";
import { TrialBanner } from "@/features/subscription/components/trial-banner";
import { getCompanyEntitlement } from "@/features/subscription/queries";
import { requireCompany } from "@/features/companies/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Shell autenticado do app (sidebar/header context).
 * NÃO bloqueia por entitlement aqui — /assinatura precisa permanecer acessível
 * quando o trial expira ou a assinatura está inadimplente.
 * O gate operacional fica em (dashboard)/dashboard/layout.tsx.
 */
export default async function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const dashboardContext = await requireCompany(user.id);
  const entitlement = await getCompanyEntitlement(dashboardContext.membership.company.id);
  const platformAdmin = await isPlatformAdmin(user);
  const showTrialBanner =
    !platformAdmin && hasPermission(dashboardContext.membership, "subscription.manage");

  return (
    <DashboardUserProvider value={{ ...dashboardContext, isPlatformAdmin: platformAdmin }}>
      <OnboardingTourProvider
        tutorialCompletedAt={dashboardContext.profile.onboardingTutorialCompletedAt}
      >
        <div className="flex min-h-screen flex-col">
          {showTrialBanner ? <TrialBanner entitlement={entitlement} /> : null}
          <div className="flex flex-1">
            <DashboardSidebar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </div>
        <OnboardingTourOverlay />
      </OnboardingTourProvider>
    </DashboardUserProvider>
  );
}
