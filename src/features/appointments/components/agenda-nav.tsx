import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildAgendaHref } from "@/features/appointments/utils";
import { addDaysToDateString, getTodayInTimezone } from "@/lib/timezone";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AgendaNavProps = {
  date: string;
  view: "day" | "week";
  timeZone: string;
  employeeId?: string;
  status?: string;
};

export function AgendaNav({ date, view, timeZone, employeeId, status }: AgendaNavProps) {
  const step = view === "week" ? 7 : 1;
  const prevDate = addDaysToDateString(date, -step);
  const nextDate = addDaysToDateString(date, step);
  const today = getTodayInTimezone(timeZone);

  const baseParams = { view, employee: employeeId, status: status !== "all" ? status : undefined };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={buildAgendaHref({ ...baseParams, date: today })}
          variant={date === today ? "default" : "outline"}
          size="sm"
        >
          Hoje
        </ButtonLink>
        <div className="flex items-center gap-1">
          <Link
            href={buildAgendaHref({ ...baseParams, date: prevDate })}
            className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
            aria-label={view === "week" ? "Semana anterior" : "Dia anterior"}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={buildAgendaHref({ ...baseParams, date: nextDate })}
            className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
            aria-label={view === "week" ? "Próxima semana" : "Próximo dia"}
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <form action="/dashboard/agenda" method="get" className="flex items-center gap-2">
          {view !== "day" ? <input type="hidden" name="view" value={view} /> : null}
          {employeeId ? <input type="hidden" name="employee" value={employeeId} /> : null}
          {status && status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <Input type="date" name="date" defaultValue={date} className="h-9 w-auto" />
        </form>
      </div>

      <div className="flex rounded-lg border p-1">
        <Link
          href={buildAgendaHref({ ...baseParams, date, view: "day" })}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Dia
        </Link>
        <Link
          href={buildAgendaHref({ ...baseParams, date, view: "week" })}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Semana
        </Link>
      </div>
    </div>
  );
}
