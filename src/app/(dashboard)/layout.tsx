import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardUserProvider } from "@/components/layout/dashboard-user-provider";
import { TrialBanner } from "@/features/subscription/components/trial-banner";
import { getCompanyEntitlement } from "@/features/subscription/queries";
import { assertOperationalEntitlement } from "@/features/subscription/require-entitlement";
import { requireCompany } from "@/features/companies/queries";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const dashboardContext = await requireCompany(user.id);
  const entitlement = await getCompanyEntitlement(dashboardContext.membership.company.id);
  assertOperationalEntitlement(entitlement);

  return (
    <DashboardUserProvider value={dashboardContext}>
      <div className="flex min-h-screen flex-col">
        <TrialBanner entitlement={entitlement} />
        <div className="flex flex-1">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </DashboardUserProvider>
  );
}
