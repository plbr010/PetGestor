import { formatAmountCents } from "@/features/finance/utils";
import type { FinanceAnalytics } from "@/features/finance/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FinanceAnalyticsKpis({ analytics }: { analytics: FinanceAnalytics }) {
  const { kpis } = analytics;
  const marginLabel =
    kpis.marginPercent == null ? "—" : `${kpis.marginPercent.toFixed(1).replace(".", ",")}%`;

  const cards = [
    {
      label: "Receita recebida",
      value: formatAmountCents(kpis.incomeReceivedCents),
      tone: "text-success",
    },
    {
      label: "Despesas pagas",
      value: formatAmountCents(kpis.expensePaidCents),
      tone: "text-destructive",
    },
    {
      label: "Resultado líquido",
      value: formatAmountCents(kpis.netResultCents),
      tone: kpis.netResultCents >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "Margem",
      value: marginLabel,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-semibold", card.tone)}>{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FinanceAnalyticsCashFlow({ analytics }: { analytics: FinanceAnalytics }) {
  const items = [
    { label: "Gerado", value: analytics.cashFlow.generatedCents },
    { label: "Recebido", value: analytics.cashFlow.receivedCents },
    { label: "Pendente", value: analytics.cashFlow.pendingCents },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Faturado x recebido x pendente</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="text-xl font-semibold">{formatAmountCents(item.value)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
