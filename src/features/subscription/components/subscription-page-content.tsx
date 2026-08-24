"use client";

import { useActionState, type FormEvent } from "react";

import {
  cancelSubscriptionAction,
  createSubscriptionCheckoutFormAction,
  refreshSubscriptionStatusAction,
  type SubscriptionActionState,
} from "@/features/subscription/actions";
import type { CompanyEntitlement, CompanySubscriptionRecord } from "@/features/subscription/types";
import { resolveSubscriptionPageState } from "@/features/subscription/subscription-ui";
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
  PAYMENT_METHOD_MANAGED_BY_MP,
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

function resolveBadge(
  pageState: ReturnType<typeof resolveSubscriptionPageState>,
): SubscriberBadge {
  return resolveSubscriberBadge(pageState);
}

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

function displayValue(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Não disponível";
}

export function SubscriptionPageContent({
  subscription,
  entitlement,
  timeZone,
}: SubscriptionPageContentProps) {
  const pageState = resolveSubscriptionPageState(subscription, entitlement);
  const badge = resolveBadge(pageState);
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
        ? "Cancelar a renovação anual? O acesso permanece até o fim do período já pago, se houver."
        : "Tem certeza que deseja cancelar a assinatura? O acesso pode continuar até o fim do período já pago.",
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  const infoRows = [
    { label: "Plano atual", value: planDisplayName(interval) },
    {
      label: "Valor",
      value: `${priceLabelForInterval(interval)}/${interval === "annual" ? "ano" : "mês"}`,
    },
    { label: "Código do plano", value: subscription.planCode },
    {
      label: "Status da assinatura",
      value: badge,
    },
    {
      label: "Status do pagamento",
      value: displayValue(subscription.lastPaymentStatus),
    },
    {
      label: "Acesso operacional",
      value: entitlement.hasOperationalAccess ? "Liberado" : "Bloqueado",
    },
    {
      label: "Início do trial",
      value: formatDateTimeInTimezone(subscription.trialStartedAt, timeZone),
    },
    {
      label: "Fim do trial",
      value: formatDateTimeInTimezone(subscription.trialEndsAt, timeZone),
    },
    {
      label: "Tempo do trial",
      value:
        pageState === "trial_active"
          ? formatAdminTrialRemaining(subscription.trialEndsAt, serverNow)
          : displayValue(null),
    },
    {
      label: "Ativação da assinatura",
      value: subscription.subscribedAt
        ? formatDateTimeInTimezone(subscription.subscribedAt, timeZone)
        : "Não disponível",
    },
    {
      label: "Início do período",
      value: subscription.currentPeriodStart
        ? formatDateTimeInTimezone(subscription.currentPeriodStart, timeZone)
        : "Não disponível",
    },
    {
      label: interval === "annual" ? "Fim do período / vencimento" : "Fim do período",
      value: subscription.currentPeriodEnd
        ? formatDateTimeInTimezone(subscription.currentPeriodEnd, timeZone)
        : "Não disponível",
    },
    {
      label: "Último pagamento",
      value: subscription.lastPaymentAt
        ? formatDateTimeInTimezone(subscription.lastPaymentAt, timeZone)
        : "Não disponível",
    },
    {
      label: "Próxima cobrança",
      value: subscription.nextPaymentAt
        ? formatDateTimeInTimezone(subscription.nextPaymentAt, timeZone)
        : "Não disponível",
    },
    {
      label: "Valor da próxima cobrança",
      value: subscription.nextPaymentAt
        ? priceLabelForInterval(interval)
        : "Não disponível",
    },
    {
      label: "Forma de pagamento",
      value: PAYMENT_METHOD_MANAGED_BY_MP,
    },
  ];

  const showPlanPicker =
    pageState === "trial_expired" || pageState === "cancelled" || pageState === "past_due";

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
          <CardDescription>{getDescription(pageState)}</CardDescription>
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
                Seu teste termina em{" "}
                {formatAdminTrialRemaining(subscription.trialEndsAt, serverNow).replace(
                  " restantes",
                  "",
                )}
              </p>
              <p className="mt-2 text-muted-foreground">
                Sem cartão e sem cobrança durante as 72 horas. Depois você escolhe mensal ou anual.
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
            {subscription.offerCode ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Oferta: {subscription.offerCode}
              </p>
            ) : null}
          </div>

          <dl className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
            {infoRows.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium sm:text-right">{row.value}</dd>
              </div>
            ))}
          </dl>

          <ul className="space-y-2 text-sm">
            {PLAN_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>

          {showPlanPicker ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Escolha o plano</p>
              <SubscriptionPlanPicker
                formAction={checkoutAction}
                pending={isStartingCheckout}
              />
              <p className="text-center text-xs text-muted-foreground">
                Você será redirecionado ao Mercado Pago. O plano só ativa após confirmação do
                pagamento.
              </p>
            </div>
          ) : null}

          {pageState === "checkout_pending" ? (
            <form action={checkoutAction} className="space-y-3">
              <input type="hidden" name="plan" value={interval} />
              <p className="text-sm text-muted-foreground">
                Checkout {interval === "annual" ? "anual" : "mensal"} pendente (
                {getPlanMarketingLabel(interval)}).
              </p>
              <Button type="submit" className="h-11 w-full" disabled={isStartingCheckout}>
                {isStartingCheckout ? "Abrindo checkout…" : "Concluir assinatura"}
              </Button>
            </form>
          ) : null}

          {pageState === "active" ? (
            <div className="flex flex-col gap-2">
              <ButtonLink href="/dashboard" className="h-11 w-full">
                Ir para o painel
              </ButtonLink>
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
            </div>
          ) : null}

          {(pageState === "checkout_pending" ||
            pageState === "trial_expired" ||
            pageState === "past_due" ||
            pageState === "active") && (
            <form action={refreshAction}>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Verificando…" : "Atualizar status da assinatura"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getTitle(state: ReturnType<typeof resolveSubscriptionPageState>): string {
  switch (state) {
    case "trial_active":
      return "Sua assinatura";
    case "active":
      return "Sua assinatura";
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
      return "Acompanhe o teste gratuito. Depois escolha mensal ou anual.";
    case "active":
      return "Acompanhe cobranças, vencimento e status da sua assinatura.";
    case "past_due":
      return "Regularize com o plano mensal ou anual para voltar a usar o PetGestor.";
    case "cancelled":
      return "Você pode assinar novamente no plano mensal ou anual.";
    case "checkout_pending":
      return "Finalize o pagamento no Mercado Pago.";
    default:
      return "Continue usando o PetGestor assinando o plano mensal ou anual.";
  }
}
