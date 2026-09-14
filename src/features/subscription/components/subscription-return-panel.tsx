import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanySubscriptionRecord } from "@/features/subscription/types";
import { formatDateTimeInTimezone } from "@/features/subscription/utils";
import { computeEntitlement } from "@/features/subscription/entitlement";
import { planDisplayName, priceLabelForInterval } from "@/config/subscription";
import { resolveSubscriptionReturnState } from "@/features/subscription/subscription-ui";

type SubscriptionReturnPanelProps = {
  subscription: CompanySubscriptionRecord;
  synced: boolean;
  syncError: string | null;
  timeZone: string;
};

export function SubscriptionReturnPanel({
  subscription,
  synced,
  syncError,
  timeZone,
}: SubscriptionReturnPanelProps) {
  const entitlement = computeEntitlement(subscription, new Date());
  const returnState = resolveSubscriptionReturnState(subscription, entitlement);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificando sua assinatura…</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {syncError ? <p className="text-destructive">{syncError}</p> : null}

        {!syncError && returnState === "confirmed" ? (
          <>
            <p className="font-medium">Assinatura confirmada pelo Mercado Pago.</p>
            <p className="text-muted-foreground">
              {planDisplayName(subscription.billingInterval)} —{" "}
              {priceLabelForInterval(subscription.billingInterval)}
              {subscription.billingInterval === "annual" ? "/ano" : "/mês"}
            </p>
            {subscription.subscribedAt ? (
              <p className="text-muted-foreground">
                Ativa desde {formatDateTimeInTimezone(subscription.subscribedAt, timeZone)}
              </p>
            ) : null}
            <ButtonLink href="/dashboard" className="w-full">
              Ir para o painel
            </ButtonLink>
          </>
        ) : null}

        {!syncError && returnState === "processing" ? (
          <>
            <p>Seu pagamento/assinatura ainda está sendo processado.</p>
            <p className="text-muted-foreground">
              Assim que o Mercado Pago confirmar o pagamento aprovado, seu acesso será
              liberado automaticamente.
            </p>
            <ButtonLink href="/assinatura" variant="outline" className="w-full">
              Voltar para assinatura
            </ButtonLink>
          </>
        ) : null}

        {!syncError && returnState === "unconfirmed" ? (
          <>
            <p>Não foi possível confirmar a assinatura ainda.</p>
            {synced ? (
              <p className="text-muted-foreground">
                Status atual: {subscription.providerStatus ?? "desconhecido"}.
              </p>
            ) : null}
            <ButtonLink href="/assinatura" className="w-full">
              Tentar novamente
            </ButtonLink>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
