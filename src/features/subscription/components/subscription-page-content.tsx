"use client";

import { useActionState } from "react";

import {
  cancelSubscriptionAction,
  createSubscriptionCheckoutFormAction,
  refreshSubscriptionStatusAction,
  type SubscriptionActionState,
} from "@/features/subscription/actions";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import { resolveSubscriptionPageState } from "@/features/subscription/subscription-ui";
import {
  formatDateTimeInTimezone,
  formatTrialBannerMessage,
} from "@/features/subscription/utils";
import {
  PLAN_MONTHLY_PRICE_LABEL,
  PLAN_CODE,
} from "@/config/subscription";
import { getPlanMarketingLabel } from "@/features/subscription/providers/mercado-pago-types";
import { LogoutButton } from "@/components/auth/logout-button";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLAN_BENEFITS = [
  "Tutores e pets",
  "Serviços",
  "Funcionários",
  "Agenda",
  "Atendimentos",
  "Financeiro",
] as const;

type SubscriptionPageContentProps = {
  subscription: CompanySubscriptionRecord;
  entitlement: CompanyEntitlement;
  timeZone: string;
};

export function SubscriptionPageContent({
  subscription,
  entitlement,
  timeZone,
}: SubscriptionPageContentProps) {
  const pageState = resolveSubscriptionPageState(subscription, entitlement);
  const [checkoutState, checkoutAction, isStartingCheckout] = useActionState(
    createSubscriptionCheckoutFormAction,
    {} as SubscriptionActionState,
  );
  const [refreshState, refreshAction, isRefreshing] = useActionState(
    refreshSubscriptionStatusAction,
    {} as SubscriptionActionState,
  );
  const [cancelState, cancelAction, isCancelling] = useActionState(
    cancelSubscriptionAction,
    {} as SubscriptionActionState,
  );

  const feedback =
    checkoutState.error ??
    checkoutState.success ??
    refreshState.error ??
    refreshState.success ??
    cancelState.error ??
    cancelState.success;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{getTitle(pageState)}</CardTitle>
          <CardDescription>{getDescription(pageState)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {feedback ? (
            <FormFeedback
              message={feedback}
              variant={feedback.includes("sucesso") || feedback.includes("sincronizada") ? "success" : "error"}
            />
          ) : null}

          {pageState === "trial_active" ? (
            <div className="rounded-lg border bg-primary/5 p-4 text-sm">
              <p>{formatTrialBannerMessage(subscription.trialEndsAt, new Date(entitlement.serverNowIso))}</p>
              <p className="mt-2 text-muted-foreground">
                Você poderá assinar após o término das 72 horas.
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Plano</p>
            <p className="text-lg font-semibold">PetGestor Mensal</p>
            <p className="mt-1 text-2xl font-bold">{PLAN_MONTHLY_PRICE_LABEL}/mês</p>
            <p className="mt-1 text-xs text-muted-foreground">Código: {PLAN_CODE}</p>
          </div>

          {(pageState === "trial_expired" || pageState === "cancelled") && (
            <TrialDates subscription={subscription} timeZone={timeZone} />
          )}

          {pageState === "active" ? (
            <ActiveDetails subscription={subscription} timeZone={timeZone} />
          ) : null}

          {pageState === "past_due" ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">Pagamento pendente</p>
              <p className="mt-1 text-muted-foreground">
                Último status: {subscription.lastPaymentStatus ?? "pendente"}.
                O Mercado Pago pode tentar novamente automaticamente.
              </p>
            </div>
          ) : null}

          <ul className="space-y-2 text-sm">
            {PLAN_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>

          {pageState === "trial_expired" || pageState === "cancelled" ? (
            <>
              <form action={checkoutAction}>
                <Button type="submit" className="w-full" disabled={isStartingCheckout}>
                  {isStartingCheckout
                    ? "Redirecionando…"
                    : `Assinar por ${getPlanMarketingLabel()}`}
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground">
                Você será redirecionado ao Mercado Pago para escolher o meio de pagamento.
                Não cobramos nada durante o período de teste.
              </p>
            </>
          ) : null}

          {pageState === "checkout_pending" ? (
            <form action={checkoutAction}>
              <Button type="submit" className="w-full" disabled={isStartingCheckout}>
                {isStartingCheckout ? "Abrindo checkout…" : "Concluir assinatura"}
              </Button>
            </form>
          ) : null}

          {pageState === "past_due" ? (
            <form action={checkoutAction}>
              <Button type="submit" className="w-full" disabled={isStartingCheckout}>
                Regularizar assinatura
              </Button>
            </form>
          ) : null}

          {pageState === "active" ? (
            <div className="flex flex-col gap-2">
              <ButtonLink href="/dashboard" className="w-full">
                Ir para o painel
              </ButtonLink>
              <form action={cancelAction}>
                <Button type="submit" variant="outline" className="w-full" disabled={isCancelling}>
                  {isCancelling ? "Cancelando…" : "Cancelar assinatura"}
                </Button>
              </form>
            </div>
          ) : null}

          {(pageState === "checkout_pending" ||
            pageState === "trial_expired" ||
            pageState === "past_due") && (
            <form action={refreshAction}>
              <Button type="submit" variant="outline" className="w-full" disabled={isRefreshing}>
                {isRefreshing ? "Verificando…" : "Atualizar status da assinatura"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <LogoutButton variant="outline" label="Sair da conta" />
      </div>
    </div>
  );
}

function getTitle(state: ReturnType<typeof resolveSubscriptionPageState>): string {
  switch (state) {
    case "trial_active":
      return "Seu teste grátis está ativo";
    case "active":
      return "Assinatura ativa";
    case "past_due":
      return "Pagamento pendente";
    case "cancelled":
      return "Assinatura cancelada";
    case "checkout_pending":
      return "Conclua sua assinatura";
    default:
      return "Seu período de teste terminou";
  }
}

function getDescription(state: ReturnType<typeof resolveSubscriptionPageState>): string {
  switch (state) {
    case "trial_active":
      return "Continue usando o PetGestor durante as 72 horas gratuitas.";
    case "active":
      return "Seu acesso operacional está liberado.";
    case "past_due":
      return "Regularize para voltar a usar o PetGestor.";
    case "cancelled":
      return "Você pode assinar novamente quando quiser.";
    case "checkout_pending":
      return "Finalize o pagamento no Mercado Pago.";
    default:
      return "Continue usando o PetGestor assinando o plano mensal.";
  }
}

function TrialDates({
  subscription,
  timeZone,
}: {
  subscription: CompanySubscriptionRecord;
  timeZone: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4 text-sm">
      <p className="font-medium">Teste gratuito encerrado</p>
      <dl className="mt-3 space-y-2">
        <Row label="Seu teste começou" value={formatDateTimeInTimezone(subscription.trialStartedAt, timeZone)} />
        <Row label="Seu teste terminou" value={formatDateTimeInTimezone(subscription.trialEndsAt, timeZone)} />
      </dl>
      <p className="mt-4 text-muted-foreground">
        Nenhuma cobrança foi realizada durante o período de teste.
      </p>
    </div>
  );
}

function ActiveDetails({
  subscription,
  timeZone,
}: {
  subscription: CompanySubscriptionRecord;
  timeZone: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4 text-sm">
      <p className="font-medium">Assinatura PetGestor Mensal — {PLAN_MONTHLY_PRICE_LABEL}/mês</p>
      {subscription.subscribedAt ? (
        <p className="mt-2 text-muted-foreground">
          Ativa desde {formatDateTimeInTimezone(subscription.subscribedAt, timeZone)}
        </p>
      ) : null}
      {subscription.nextPaymentAt ? (
        <p className="mt-1 text-muted-foreground">
          Próxima cobrança: {formatDateTimeInTimezone(subscription.nextPaymentAt, timeZone)}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
