import Link from "next/link";

import { buildFinanceHref } from "@/features/finance/utils";
import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/utils";

type FinancePeriodNavProps = {
  from: string;
  to: string;
  preset: string;
  filters: Record<string, string | undefined>;
};

export function FinancePeriodNav({ from, to, preset, filters }: FinancePeriodNavProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildFinanceHref({ ...filters, preset: "today" })}
          className={cn(
            "inline-flex h-9 items-center rounded-md border px-3 text-sm",
            preset === "today" && "bg-primary text-primary-foreground",
          )}
        >
          Hoje
        </Link>
        <Link
          href={buildFinanceHref({ ...filters, preset: "week" })}
          className={cn(
            "inline-flex h-9 items-center rounded-md border px-3 text-sm",
            preset === "week" && "bg-primary text-primary-foreground",
          )}
        >
          Esta semana
        </Link>
        <Link
          href={buildFinanceHref({ ...filters, preset: "month" })}
          className={cn(
            "inline-flex h-9 items-center rounded-md border px-3 text-sm",
            preset === "month" && "bg-primary text-primary-foreground",
          )}
        >
          Este mês
        </Link>
      </div>

      <form action="/dashboard/financeiro" method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(filters).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null,
        )}
        <input type="hidden" name="preset" value="custom" />
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">De</span>
          <input type="date" name="from" defaultValue={from} className="h-9 rounded-md border px-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Até</span>
          <input type="date" name="to" defaultValue={to} className="h-9 rounded-md border px-2" />
        </label>
        <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground">
          Aplicar
        </button>
      </form>

      <div className="flex gap-2">
        <ButtonLink href="/dashboard/financeiro/nova-receita" size="sm">
          Nova receita
        </ButtonLink>
        <ButtonLink href="/dashboard/financeiro/nova-despesa" variant="outline" size="sm">
          Nova despesa
        </ButtonLink>
      </div>
    </div>
  );
}
