import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardUserProvider } from "@/components/layout/dashboard-user-provider";
import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";
import { OnboardingExperienceLayer } from "@/features/onboarding-tour/components/onboarding-experience-layer";
import { OnboardingTourProvider } from "@/features/onboarding-tour/onboarding-tour-provider";
import { loadOnboardingSnapshot } from "@/features/onboarding-tour/queries";
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

  const onboardingSnapshot = await loadOnboardingSnapshot({
    companyId: dashboardContext.membership.company.id,
    userId: user.id,
    legacyTutorialCompletedAt: dashboardContext.profile.onboardingTutorialCompletedAt,
  });

  return (
    <DashboardUserProvider value={{ ...dashboardContext, isPlatformAdmin: platformAdmin }}>
      <OnboardingTourProvider
        initialSnapshot={onboardingSnapshot}
        companyId={dashboardContext.membership.company.id}
        userId={user.id}
      >
        <div className="flex min-h-screen flex-col">
          {showTrialBanner ? <TrialBanner entitlement={entitlement} /> : null}
          <div className="flex flex-1">
            <DashboardSidebar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </div>
        <WhatsAppFloatingButton />
        <OnboardingExperienceLayer />
      </OnboardingTourProvider>
    </DashboardUserProvider>
  );
}
