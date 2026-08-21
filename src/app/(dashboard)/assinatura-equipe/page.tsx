import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { requireCompany } from "@/features/companies/queries";
import { requireUser } from "@/lib/auth/require-user";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Página para funcionários quando o pet shop está sem assinatura ativa.
 * Não oferece checkout — só o dono/gestor paga em /assinatura.
 */
export default async function AssinaturaEquipePage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);

  if (hasPermission(context.membership, "subscription.manage")) {
    redirect("/assinatura");
  }

  return (
    <>
      <DashboardHeader
        title="Acesso temporariamente suspenso"
        description="A assinatura do pet shop precisa ser regularizada"
      />
      <main className="flex flex-1 items-start justify-center overflow-x-hidden p-4 sm:p-6">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Você não precisa pagar</h2>
          <p className="text-sm text-muted-foreground">
            Funcionários usam o PetGestor pela assinatura do pet shop. Enquanto{" "}
            <strong>{context.membership.company.name}</strong> estiver com a assinatura
            (ou trial) ativa, seu acesso continua liberado.
          </p>
          <p className="text-sm text-muted-foreground">
            Agora o acesso operacional está bloqueado porque a assinatura da empresa não está
            ativa. Peça ao dono ou gestor para renovar em <strong>Assinatura</strong>.
          </p>
          <LogoutButton className="w-full" label="Sair da conta" variant="outline" />
        </div>
      </main>
    </>
  );
}
