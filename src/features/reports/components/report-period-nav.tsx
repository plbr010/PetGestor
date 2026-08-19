"use client";

import Link from "next/link";

import type { ReportPreset } from "@/features/reports/period";
import { cn } from "@/lib/utils";

const PRESETS: { key: ReportPreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "last7", label: "7 dias" },
  { key: "month", label: "Mês" },
  { key: "prev_month", label: "Mês ant." },
  { key: "last30", label: "30 dias" },
  { key: "year", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

type ReportPeriodNavProps = {
  basePath: string;
  from: string;
  to: string;
  preset: ReportPreset;
};

function buildHref(basePath: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ReportPeriodNav({ basePath, from, to, preset }: ReportPeriodNavProps) {
  const showCustomInputs = preset === "custom";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((item) => (
          <Link
            key={item.key}
            href={
              item.key === "custom"
                ? buildHref(basePath, { preset: "custom", from, to })
                : buildHref(basePath, { preset: item.key })
            }
            className={cn(
              "inline-flex min-h-9 items-center rounded-md border px-3 text-sm transition-colors hover:bg-muted/50",
              preset === item.key && "bg-primary text-primary-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {showCustomInputs ? (
        <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="preset" value="custom" />
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">De</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="min-h-9 rounded-md border px-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Até</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="min-h-9 rounded-md border px-2"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"
          >
            Aplicar
          </button>
        </form>
      ) : null}
    </div>
  );
}
