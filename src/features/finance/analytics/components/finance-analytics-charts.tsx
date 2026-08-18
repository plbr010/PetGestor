import Link from "next/link";

import type { FinanceBreakdownItem } from "@/features/finance/analytics/types";
import { formatAmountCents } from "@/features/finance/utils";
import { buildFinanceHref } from "@/features/finance/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#64748b",
];

type BreakdownChartProps = {
  title: string;
  items: FinanceBreakdownItem[];
  drillParam: "drillOrigin" | "drillCategory";
  periodParams: Record<string, string | undefined>;
  emptyMessage: string;
};

function DonutChart({ items }: { items: FinanceBreakdownItem[] }) {
  const total = items.reduce((sum, item) => sum + item.cents, 0);
  if (total <= 0) {
    return null;
  }

  const segments = items.reduce<
    Array<{
      item: FinanceBreakdownItem;
      start: number;
      end: number;
      color: string;
    }>
  >((acc, item, index) => {
    const fraction = item.cents / total;
    const start = acc.length > 0 ? acc[acc.length - 1]!.end : 0;
    const end = start + fraction;
    acc.push({
      item,
      start,
      end,
      color: CHART_COLORS[index % CHART_COLORS.length],
    });
    return acc;
  }, []);

  const size = 160;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto size-40 shrink-0" role="img">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/30"
      />
      {segments.map(({ item, start, end, color }) => {
        const length = (end - start) * circumference;
        const offset = circumference * (1 - end);
        return (
          <circle
            key={item.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          >
            <title>
              {item.label}: {formatAmountCents(item.cents)} ({item.percent.toFixed(1)}%)
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

function BarChart({ items }: { items: FinanceBreakdownItem[] }) {
  const max = Math.max(...items.map((item) => item.cents), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 font-medium">{formatAmountCents(item.cents)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/40">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${(item.cents / max) * 100}%`,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinanceBreakdownChart({
  title,
  items,
  drillParam,
  periodParams,
  emptyMessage,
}: BreakdownChartProps) {
  const useDonut = items.length > 0 && items.length <= 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[160px_1fr] lg:items-center">
            {useDonut ? <DonutChart items={items} /> : null}
            <div className="space-y-3">
              {useDonut
                ? items.map((item, index) => (
                    <Link
                      key={item.key}
                      href={buildFinanceHref({
                        ...periodParams,
                        [drillParam]: item.key,
                      })}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {formatAmountCents(item.cents)}
                        <span className="ml-2 text-muted-foreground">
                          {item.percent.toFixed(1).replace(".", ",")}%
                        </span>
                      </span>
                    </Link>
                  ))
                : (
                  <BarChart items={items} />
                )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceEvolutionChart({
  analytics,
}: {
  analytics: import("@/features/finance/analytics/types").FinanceAnalytics;
}) {
  const { evolution } = analytics;
  const max = Math.max(
    ...evolution.flatMap((bucket) => [bucket.incomeCents, bucket.expenseCents, Math.abs(bucket.resultCents)]),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evolução financeira</CardTitle>
      </CardHeader>
      <CardContent>
        {evolution.every((bucket) => bucket.incomeCents === 0 && bucket.expenseCents === 0) ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há movimentações neste período.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" /> Receitas
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-500" /> Despesas
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-500" /> Resultado
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {evolution.map((bucket) => (
                <div key={bucket.key} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">{bucket.label}</p>
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="mb-1 flex justify-between">
                        <span>Receitas</span>
                        <span>{formatAmountCents(bucket.incomeCents)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${(bucket.incomeCents / max) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between">
                        <span>Despesas</span>
                        <span>{formatAmountCents(bucket.expenseCents)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40">
                        <div
                          className="h-1.5 rounded-full bg-rose-500"
                          style={{ width: `${(bucket.expenseCents / max) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between pt-1 font-medium">
                      <span>Resultado</span>
                      <span>{formatAmountCents(bucket.resultCents)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
