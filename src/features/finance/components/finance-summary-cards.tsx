import { formatAmountCents } from "@/features/finance/utils";
import type { FinancialSummary } from "@/features/finance/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FinanceSummaryCardsProps = {
  summary: FinancialSummary;
};

export function FinanceSummaryCards({ summary }: FinanceSummaryCardsProps) {
  const cards = [
    {
      label: "Receitas recebidas",
      value: summary.incomePaidCents,
      tone: "text-success",
    },
    {
      label: "Receitas pendentes",
      value: summary.incomePendingCents,
      tone: "text-foreground",
    },
    {
      label: "Despesas pagas",
      value: summary.expensePaidCents,
      tone: "text-destructive",
    },
    {
      label: "Despesas pendentes",
      value: summary.expensePendingCents,
      tone: "text-foreground",
    },
    {
      label: "Resultado realizado",
      value: summary.realizedResultCents,
      tone:
        summary.realizedResultCents >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "Resultado projetado",
      value: summary.projectedResultCents,
      tone: "text-muted-foreground",
      subtitle: "Projetado",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
              {"subtitle" in card && card.subtitle ? (
                <span className="ml-2 text-xs">({card.subtitle})</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-semibold", card.tone)}>
              {formatAmountCents(card.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
