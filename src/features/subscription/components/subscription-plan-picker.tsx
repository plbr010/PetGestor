"use client";

import {
  PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL,
  PLAN_ANNUAL_PRICE_LABEL,
  PLAN_ANNUAL_SAVINGS_LABEL,
  PLAN_MONTHLY_PRICE_LABEL,
  type BillingInterval,
} from "@/config/subscription";
import { trackMetaInitiateCheckout } from "@/lib/analytics/meta-pixel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanPickerProps = {
  formAction: (payload: FormData) => void;
  pending?: boolean;
  /** Plano atual (mostra “Plano atual” e ajusta CTAs de troca). */
  currentInterval?: BillingInterval | null;
  /** Quando true, esconde o botão do plano atual. */
  hideCurrentPlanAction?: boolean;
};

export function SubscriptionPlanPicker({
  formAction,
  pending = false,
  currentInterval = null,
  hideCurrentPlanAction = false,
}: PlanPickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlanCard
        formAction={formAction}
        interval="monthly"
        title="Mensal"
        price={PLAN_MONTHLY_PRICE_LABEL}
        period="por mês"
        bullets={["Cobrança mensal", "Acesso completo ao PetGestor"]}
        cta={
          currentInterval === "monthly"
            ? "Plano atual"
            : currentInterval === "annual"
              ? "Mudar para mensal"
              : "Assinar mensal"
        }
        isCurrent={currentInterval === "monthly"}
        disabled={
          pending ||
          (hideCurrentPlanAction && currentInterval === "monthly") ||
          currentInterval === "annual"
        }
        disabledHint={
          currentInterval === "annual"
            ? "Disponível só no fim do período anual já pago."
            : undefined
        }
        pending={pending}
      />
      <PlanCard
        formAction={formAction}
        interval="annual"
        title="Anual"
        price={PLAN_ANNUAL_PRICE_LABEL}
        period="por ano"
        highlight
        bullets={[
          `Equivale a ${PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL}/mês`,
          `Economize ${PLAN_ANNUAL_SAVINGS_LABEL} em 12 meses`,
        ]}
        cta={
          currentInterval === "annual"
            ? "Plano atual"
            : currentInterval === "monthly"
              ? "Mudar para anual"
              : "Assinar anual"
        }
        isCurrent={currentInterval === "annual"}
        disabled={pending || (hideCurrentPlanAction && currentInterval === "annual")}
        pending={pending}
      />
    </div>
  );
}

function PlanCard({
  formAction,
  interval,
  title,
  price,
  period,
  bullets,
  cta,
  highlight = false,
  isCurrent = false,
  disabled = false,
  disabledHint,
  pending,
}: {
  formAction: (payload: FormData) => void;
  interval: BillingInterval;
  title: string;
  price: string;
  period: string;
  bullets: string[];
  cta: string;
  highlight?: boolean;
  isCurrent?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  pending: boolean;
}) {
  return (
    <form
      action={formAction}
      onSubmit={() => {
        trackMetaInitiateCheckout(interval);
      }}
      className={cn(
        "flex flex-col rounded-2xl border p-4",
        highlight || isCurrent ? "border-primary bg-primary/5 shadow-sm" : "bg-card",
      )}
    >
      <input type="hidden" name="plan" value={interval} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold">{title}</p>
        {highlight && !isCurrent ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            Melhor oferta
          </Badge>
        ) : null}
        {isCurrent ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Plano atual
          </Badge>
        ) : null}
      </div>
      <p className="text-3xl font-bold tracking-tight">{price}</p>
      <p className="text-sm text-muted-foreground">{period}</p>
      {highlight ? (
        <p className="mt-2 text-sm font-medium text-primary">
          Economize {PLAN_ANNUAL_SAVINGS_LABEL}
        </p>
      ) : null}
      <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
        {bullets.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {disabledHint ? (
        <p className="mt-3 text-xs text-muted-foreground">{disabledHint}</p>
      ) : null}
      <Button
        type="submit"
        className="mt-5 h-11 w-full"
        variant={isCurrent || disabled ? "outline" : "default"}
        disabled={disabled || isCurrent}
      >
        {pending && !disabled && !isCurrent ? "Redirecionando…" : cta}
      </Button>
    </form>
  );
}
