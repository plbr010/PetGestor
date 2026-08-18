import { formatAmountCents } from "@/features/finance/utils";
import type { FinanceRankingItem } from "@/features/finance/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function RankingList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: FinanceRankingItem[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ol className="space-y-3">
            {items.map((item) => (
              <li
                key={`${item.rank}-${item.label}`}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">#{item.rank}</p>
                  <p className="truncate font-medium">{item.label}</p>
                </div>
                <p className="shrink-0 font-semibold">{formatAmountCents(item.cents)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceAnalyticsRankings({
  topIncome,
  topExpenses,
}: {
  topIncome: FinanceRankingItem[];
  topExpenses: FinanceRankingItem[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <RankingList
        title="Principais fontes de receita"
        items={topIncome}
        emptyMessage="Sem receitas detalhadas neste período."
      />
      <RankingList
        title="Maiores despesas"
        items={topExpenses}
        emptyMessage="Sem despesas detalhadas neste período."
      />
    </div>
  );
}

export function FinanceProfitByOrigin({
  items,
}: {
  items: import("@/features/finance/analytics/types").FinanceProfitByOrigin[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lucro bruto por origem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.originKey} className="rounded-lg border p-4">
            <p className="font-medium">{item.originLabel}</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Receita</p>
                <p className="font-semibold">{formatAmountCents(item.revenueCents)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Custo</p>
                <p className="font-semibold">{formatAmountCents(item.costCents)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Lucro bruto</p>
                <p className="font-semibold">{formatAmountCents(item.grossProfitCents)}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
