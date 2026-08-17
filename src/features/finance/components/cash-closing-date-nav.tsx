import Link from "next/link";

import { addDaysToDateString, getTodayInTimezone } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type CashClosingDateNavProps = {
  selectedDate: string;
  timeZone: string;
};

export function CashClosingDateNav({ selectedDate, timeZone }: CashClosingDateNavProps) {
  const today = getTodayInTimezone(timeZone);
  const yesterday = addDaysToDateString(today, -1);

  const links = [
    { label: "Hoje", date: today },
    { label: "Ontem", date: yesterday },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.date}
            href={`/dashboard/financeiro/fechamento?date=${link.date}`}
            className={cn(
              "inline-flex h-10 items-center rounded-md border px-4 text-sm",
              selectedDate === link.date && "bg-primary text-primary-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <form action="/dashboard/financeiro/fechamento" method="get" className="flex items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Data</span>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="h-10 rounded-md border px-3"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >
          Ver
        </button>
      </form>
    </div>
  );
}
