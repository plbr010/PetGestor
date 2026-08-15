import { Repeat } from "lucide-react";

import { cn } from "@/lib/utils";

type AppointmentRecurrenceBadgeProps = {
  className?: string;
  compact?: boolean;
};

export function AppointmentRecurrenceBadge({
  className,
  compact = false,
}: AppointmentRecurrenceBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      title="Faz parte de uma recorrência"
    >
      <Repeat className="size-3" aria-hidden="true" />
      {compact ? null : <span>Recorrente</span>}
      <span className="sr-only">Agendamento recorrente</span>
    </span>
  );
}
