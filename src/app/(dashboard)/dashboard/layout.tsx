import { getCompanyEntitlement } from "@/features/subscription/queries";
import { assertOperationalEntitlement } from "@/features/subscription/require-entitlement";
import { assertCurrentRoutePermission } from "@/lib/auth/assert-route-permission";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireUser } from "@/lib/auth/require-user";
import { requireCompany } from "@/features/companies/queries";

/**
 * Gate operacional: bloqueia módulos do dashboard quando trial/assinatura não liberam acesso.
 * /assinatura fica fora deste layout (irmã), então não entra em loop de redirect.
 */
export default async function OperationalDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const platformAdmin = await isPlatformAdmin(user);

  if (!platformAdmin) {
    const entitlement = await getCompanyEntitlement(context.membership.company.id);
    assertOperationalEntitlement(entitlement);
  }

  if (!platformAdmin) {
    await assertCurrentRoutePermission();
  }

  return children;
}
