import type { AppointmentStatus } from "@/config/demo-data";
import { statusLabels } from "@/config/demo-data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusVariant: Record<
  AppointmentStatus,
  "default" | "secondary" | "outline"
> = {
  confirmado: "default",
  "em-andamento": "secondary",
  pendente: "outline",
};

type StatusBadgeProps = {
  status: AppointmentStatus;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]} className={cn("font-normal", className)}>
      {statusLabels[status]}
    </Badge>
  );
}
