import { AuthShell } from "@/components/auth/auth-shell";
import { SubscriptionReturnPanel } from "@/features/subscription/components/subscription-return-panel";
import { requireCompanySubscription } from "@/features/subscription/queries";
import { syncSubscriptionFromProvider } from "@/features/subscription/sync";
import { requireCompany } from "@/features/companies/queries";
import { requireUser } from "@/lib/auth/require-user";

export default async function AssinaturaRetornoPage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const subscription = await requireCompanySubscription(context.membership.company.id);

  let syncError: string | null = null;
  let synced = false;

  if (subscription.providerSubscriptionId) {
    try {
      await syncSubscriptionFromProvider({
        companyId: context.membership.company.id,
        providerSubscriptionId: subscription.providerSubscriptionId,
      });
      synced = true;
    } catch {
      syncError = "Não foi possível confirmar o pagamento.";
    }
  } else {
    syncError = "Nenhuma assinatura em andamento foi encontrada.";
  }

  const refreshed = await requireCompanySubscription(context.membership.company.id);

  return (
    <AuthShell>
      <SubscriptionReturnPanel
        subscription={refreshed}
        synced={synced}
        syncError={syncError}
        timeZone={context.membership.company.timezone}
      />
    </AuthShell>
  );
}
