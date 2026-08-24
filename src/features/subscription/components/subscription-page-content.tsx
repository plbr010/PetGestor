"use client";

import { useActionState, type FormEvent } from "react";

import {
  cancelSubscriptionAction,
  createSubscriptionCheckoutFormAction,
  refreshSubscriptionStatusAction,
  type SubscriptionActionState,
} from "@/features/subscription/actions";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import {
  canShowPlanPicker,
  resolveSubscriptionPageState,
} from "@/features/subscription/subscription-ui";
import { formatDateTimeInTimezone } from "@/features/subscription/utils";
import { formatAdminTrialRemaining } from "@/features/admin/utils";
import {
  planDisplayName,
  planPeriodLabel,
  priceLabelForInterval,
} from "@/config/subscription";
import { getPlanMarketingLabel } from "@/features/subscription/providers/mercado-pago-types";
import {
  resolveSubscriberBadge,
  type SubscriberBadge,
} from "@/features/subscription/subscriber-view";
import { SubscriptionPlanPicker } from "@/features/subscription/components/subscription-plan-picker";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SubscriptionPageContentProps = {
  subscription: CompanySubscriptionRecord;
  entitlement: CompanyEntitlement;
  timeZone: string;
};

function badgeClass(badge: SubscriberBadge): string {
  switch (badge) {
    case "TRIAL":
      return "border-transparent bg-sky-100 text-sky-900";
    case "ATIVO":
      return "border-transparent bg-emerald-100 text-emerald-900";
    case "PAGAMENTO PENDENTE":
      return "border-transparent bg-amber-100 text-amber-950";
    case "INADIMPLENTE":
      return "border-transparent bg-orange-100 text-orange-950";
    case "CANCELADO":
      return "border-transparent bg-zinc-200 text-zinc-800";
    case "EXPIRADO":
      return "border-transparent bg-red-100 text-red-900";
  }
}

export function SubscriptionPageContent({
  subscription,
  entitlement,
  timeZone,
}: SubscriptionPageContentProps) {
  const pageState = resolveSubscriptionPageState(subscription, entitlement);
  const badge = resolveSubscriberBadge(pageState);
  const serverNow = new Date(entitlement.serverNowIso);
  const interval = subscription.billingInterval;
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

  function confirmCancel(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      interval === "annual"
        ? "Cancelar a renovação anual? O acesso permanece até o fim do período já pago."
        : "Cancelar a renovação mensal? O acesso permanece até o fim do período já pago, se houver.",
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  function confirmAnnualUpgrade(event: FormEvent) {
    const form = event.target instanceof HTMLFormElement
      ? event.target
      : event.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : null;
    if (!form) {
      return;
    }

    const plan = new FormData(form).get("plan");
    if (pageState !== "active" || interval !== "monthly" || plan !== "annual") {
      return;
    }

    const confirmed = window.confirm(
      "Ao mudar para o anual, a renovação mensal é encerrada e você paga R$ 799 no Mercado Pago. O plano anual só ativa após a confirmação do pagamento. Continuar?",
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  const periodEndLabel = subscription.currentPeriodEnd
    ? formatDateTimeInTimezone(subscription.currentPeriodEnd, timeZone)
    : null;
  const nextChargeLabel = subscription.nextPaymentAt
    ? formatDateTimeInTimezone(subscription.nextPaymentAt, timeZone)
    : null;

  const showPlans = canShowPlanPicker(pageState) && pageState !== "trial_active";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{getTitle(pageState)}</CardTitle>
            <Badge variant="outline" className={cn(badgeClass(badge))}>
              {badge}
            </Badge>
          </div>
          <CardDescription>{getDescription(pageState, interval)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {feedback ? (
            <FormFeedback
              message={feedback}
              variant={
                feedback.includes("sucesso") ||
                feedback.includes("sincronizada") ||
                feedback.includes("Renovação cancelada")
                  ? "success"
                  : "error"
              }
            />
          ) : null}

          {pageState === "trial_active" ? (
            <div className="rounded-lg border bg-primary/5 p-4 text-sm">
              <p className="font-medium">
                Teste grátis até{" "}
                {formatDateTimeInTimezone(subscription.trialEndsAt, timeZone)}
              </p>
              <p className="mt-1 text-muted-foreground">
                Restam {formatAdminTrialRemaining(subscription.trialEndsAt, serverNow)}. Sem cartão
                durante o teste.
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Plano atual</p>
            <p className="text-lg font-semibold">{planDisplayName(interval)}</p>
            <p className="mt-1 text-2xl font-bold">
              {priceLabelForInterval(interval)}{" "}
              <span className="text-base font-medium text-muted-foreground">
                {planPeriodLabel(interval)}
              </span>
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              {pageState === "active" || pageState === "checkout_pending" ? (
                <>
                  {periodEndLabel ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {interval === "annual" ? "Válido até" : "Fim do período"}
                      </dt>
                      <dd className="font-medium text-right">{periodEndLabel}</dd>
                    </div>
                  ) : null}
                  {nextChargeLabel && !subscription.cancelAtPeriodEnd ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Próxima cobrança</dt>
                      <dd className="font-medium text-right">{nextChargeLabel}</dd>
                    </div>
                  ) : null}
                  {subscription.cancelAtPeriodEnd ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Renovação</dt>
                      <dd className="font-medium text-right">Cancelada</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>
          </div>

          {pageState === "checkout_pending" ? (
            <form action={checkoutAction} className="space-y-3">
              <input type="hidden" name="plan" value={interval} />
              <p className="text-sm text-muted-foreground">
                Pagamento {interval === "annual" ? "anual" : "mensal"} pendente (
                {getPlanMarketingLabel(interval)}). O plano só ativa após confirmação.
              </p>
              <Button type="submit" className="h-11 w-full" disabled={isStartingCheckout}>
                {isStartingCheckout ? "Abrindo checkout…" : "Concluir pagamento"}
              </Button>
            </form>
          ) : null}

          {showPlans ? (
            <div className="space-y-3" onSubmitCapture={confirmAnnualUpgrade}>
              <div>
                <p className="text-sm font-medium">
                  {pageState === "active" ? "Mudar plano" : "Escolha o plano"}
                </p>
                {pageState === "active" && interval === "monthly" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mudar para anual encerra a renovação mensal e cobra R$ 799 após o pagamento no
                    Mercado Pago.
                  </p>
                ) : null}
                {pageState === "active" && interval === "annual" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    O anual já pago vale até o fim do período. Para ir ao mensal depois, cancele a
                    renovação e assine o mensal quando o período acabar.
                  </p>
                ) : null}
              </div>
              <SubscriptionPlanPicker
                formAction={checkoutAction}
                pending={isStartingCheckout}
                currentInterval={
                  pageState === "active" || pageState === "checkout_pending" ? interval : null
                }
                hideCurrentPlanAction
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {pageState === "active" || entitlement.hasOperationalAccess ? (
              <ButtonLink href="/dashboard" className="h-11 w-full">
                Ir para o painel
              </ButtonLink>
            ) : null}

            {pageState === "active" && !subscription.cancelAtPeriodEnd ? (
              <form action={cancelAction} onSubmit={confirmCancel}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelando…" : "Cancelar renovação"}
                </Button>
              </form>
            ) : null}

            {pageState === "checkout_pending" ||
            pageState === "past_due" ||
            pageState === "active" ? (
              <form action={refreshAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="h-11 w-full text-muted-foreground"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Verificando…" : "Atualizar status"}
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getTitle(state: ReturnType<typeof resolveSubscriptionPageState>): string {
  switch (state) {
    case "past_due":
      return "Pagamento pendente";
    case "cancelled":
      return "Assinatura cancelada";
    case "checkout_pending":
      return "Conclua o pagamento";
    case "trial_expired":
      return "Escolha um plano";
    default:
      return "Sua assinatura";
  }
}

function getDescription(
  state: ReturnType<typeof resolveSubscriptionPageState>,
  interval: "monthly" | "annual",
): string {
  switch (state) {
    case "trial_active":
      return "Acompanhe o teste. Depois escolha mensal ou anual.";
    case "active":
      return interval === "annual"
        ? "Gerencie renovação e, se quiser, troque de plano no fim do período."
        : "Gerencie renovação ou mude para o plano anual.";
    case "past_due":
      return "Regularize com mensal ou anual para voltar a usar o PetGestor.";
    case "cancelled":
      return "Você pode assinar novamente quando quiser.";
    case "checkout_pending":
      return "Finalize no Mercado Pago. Nada é ativado antes da confirmação.";
    default:
      return "Assine o plano mensal ou anual para continuar.";
  }
}
