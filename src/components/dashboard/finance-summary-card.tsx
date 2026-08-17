import { ArrowDownRight, ArrowUpRight, Clock, Wallet } from "lucide-react";

import type { FinancialSummary } from "@/features/finance/types";
import { formatAmountCents } from "@/features/finance/utils";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FinanceSummaryCardProps = {
  incomePaidTodayCents: number;
  pendingReceivablesCents: number;
  expensePaidMonthCents: number;
  realizedResultMonthCents: number;
  monthlySummary: FinancialSummary;
};

export function FinanceSummaryCard({
  incomePaidTodayCents,
  pendingReceivablesCents,
  expensePaidMonthCents,
  realizedResultMonthCents,
  monthlySummary,
}: FinanceSummaryCardProps) {
  const rows = [
    {
      label: "Recebido hoje",
      value: formatAmountCents(incomePaidTodayCents),
      icon: ArrowUpRight,
      tone: "text-success",
    },
    {
      label: "A receber",
      value: formatAmountCents(pendingReceivablesCents),
      icon: Clock,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Despesas do mês",
      value: formatAmountCents(expensePaidMonthCents),
      icon: ArrowDownRight,
      tone: "text-destructive",
    },
    {
      label: "Resultado do mês",
      value: formatAmountCents(realizedResultMonthCents),
      icon: Wallet,
      tone: realizedResultMonthCents >= 0 ? "text-foreground" : "text-destructive",
    },
  ] as const;

  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Resumo financeiro</CardTitle>
          <CardDescription>
            Gerada {formatAmountCents(monthlySummary.incomeGeneratedCents)} · recebida{" "}
            {formatAmountCents(monthlySummary.incomeReceivedCents)} · pendente{" "}
            {formatAmountCents(monthlySummary.incomePendingCents)}
          </CardDescription>
        </div>
        <ButtonLink href="/dashboard/financeiro" variant="outline" size="sm">
          Ver financeiro
        </ButtonLink>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <row.icon className={`size-4 ${row.tone}`} aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{row.label}</span>
            </div>
            <span className={`text-sm font-semibold ${row.tone}`}>{row.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
