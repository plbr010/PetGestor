"use client";

import {
  PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL,
  PLAN_ANNUAL_PRICE_LABEL,
  PLAN_ANNUAL_SAVINGS_LABEL,
  PLAN_MONTHLY_PRICE_LABEL,
  type BillingInterval,
} from "@/config/subscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SHARED_BENEFITS = [
  "Acesso completo ao PetGestor",
  "Cancelamento conforme as regras do plano",
] as const;

type PlanPickerProps = {
  formAction: (payload: FormData) => void;
  pending?: boolean;
};

export function SubscriptionPlanPicker({ formAction, pending = false }: PlanPickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlanCard
        formAction={formAction}
        interval="monthly"
        title="Mensal"
        price={PLAN_MONTHLY_PRICE_LABEL}
        period="por mês"
        bullets={["Cobrança mensal", ...SHARED_BENEFITS]}
        cta="Assinar mensal"
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
          `Economize ${PLAN_ANNUAL_SAVINGS_LABEL} em comparação ao plano mensal durante 12 meses.`,
          "Cobrança anual",
          ...SHARED_BENEFITS,
        ]}
        cta="Assinar anual"
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
  pending: boolean;
}) {
  return (
    <form
      action={formAction}
      className={cn(
        "flex flex-col rounded-2xl border p-4",
        highlight ? "border-primary bg-primary/5 shadow-sm" : "bg-card",
      )}
    >
      <input type="hidden" name="plan" value={interval} />
      <div className="mb-3 flex items-center gap-2">
        <p className="text-base font-semibold">{title}</p>
        {highlight ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            Melhor oferta
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
      <Button type="submit" className="mt-5 h-11 w-full" disabled={pending}>
        {pending ? "Redirecionando…" : cta}
      </Button>
    </form>
  );
}
