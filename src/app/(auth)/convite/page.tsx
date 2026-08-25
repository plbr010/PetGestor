import { redirect } from "next/navigation";

import { AcceptInviteCard } from "@/features/employees/access/components/accept-invite-card";
import { peekPendingInvite } from "@/features/employees/access/accept-invite";
import { mapInviteAcceptReason } from "@/features/employees/access/invite-messages";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getCurrentCompanyMembership } from "@/features/companies/queries";
import { AuthShell } from "@/components/auth/auth-shell";
import { ErrorMessage } from "@/components/shared/error-message";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ConvitePage() {
  const user = await requireAuthenticatedUser();
  const membership = await getCurrentCompanyMembership(user.id);
  const pending = await peekPendingInvite();

  if (pending.found) {
    return (
      <AuthShell showLogout>
        <AcceptInviteCard
          companyName={pending.companyName}
          expiresAt={pending.expiresAt}
        />
      </AuthShell>
    );
  }

  if (membership) {
    redirect("/dashboard");
  }

  const message = mapInviteAcceptReason(
    pending.reason === "rpc_unavailable" ? "no_pending_invite" : pending.reason,
  );

  return (
    <AuthShell showLogout>
      <Card className="border bg-card/95 shadow-lg">
        <CardHeader>
          <CardTitle>Convite</CardTitle>
          <CardDescription>Não há convite pendente para continuar agora.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorMessage message={message} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink href="/onboarding" className="w-full sm:w-auto">
              Configurar meu pet shop
            </ButtonLink>
            <ButtonLink href="/entrar" variant="outline" className="w-full sm:w-auto">
              Voltar ao login
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
