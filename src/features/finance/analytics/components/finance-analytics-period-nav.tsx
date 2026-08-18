"use client";

import Link from "next/link";

import type { FinanceAnalyticsPreset } from "@/features/finance/analytics/types";
import { buildFinanceHref } from "@/features/finance/utils";
import { cn } from "@/lib/utils";

const PRESETS: { key: FinanceAnalyticsPreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "last7", label: "Últimos 7 dias" },
  { key: "month", label: "Este mês" },
  { key: "prev_month", label: "Mês anterior" },
  { key: "last30", label: "Últimos 30 dias" },
  { key: "week", label: "Esta semana" },
];

type FinanceAnalyticsPeriodNavProps = {
  from: string;
  to: string;
  preset: FinanceAnalyticsPreset;
  filters: Record<string, string | undefined>;
};

export function FinanceAnalyticsPeriodNav({
  from,
  to,
  preset,
  filters,
}: FinanceAnalyticsPeriodNavProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((item) => (
          <Link
            key={item.key}
            href={buildFinanceHref({ ...filters, preset: item.key, drillOrigin: undefined, drillCategory: undefined })}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md border px-3 text-sm",
              preset === item.key && "bg-primary text-primary-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <form action="/dashboard/financeiro" method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(filters).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null,
        )}
        <input type="hidden" name="preset" value="custom" />
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">De</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="min-h-10 rounded-md border px-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Até</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="min-h-10 rounded-md border px-2"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
