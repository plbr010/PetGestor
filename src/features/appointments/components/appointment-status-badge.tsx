import { APPOINTMENT_STATUS_LABELS } from "@/features/appointments/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/database.types";

const statusVariant: Record<
  AppointmentStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  scheduled: "outline",
  confirmed: "default",
  in_progress: "secondary",
  completed: "secondary",
  cancelled: "destructive",
  no_show: "destructive",
};

type AppointmentStatusBadgeProps = {
  status: AppointmentStatus;
  className?: string;
};

export function AppointmentStatusBadge({ status, className }: AppointmentStatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]} className={cn("font-normal", className)}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
