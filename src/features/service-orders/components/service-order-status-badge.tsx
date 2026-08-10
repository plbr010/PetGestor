import { SERVICE_ORDER_STATUS_LABELS } from "@/features/service-orders/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceOrderStatus } from "@/types/database.types";

const statusVariant: Record<
  ServiceOrderStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  waiting: "outline",
  in_progress: "default",
  ready: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};

type ServiceOrderStatusBadgeProps = {
  status: ServiceOrderStatus;
  className?: string;
};

export function ServiceOrderStatusBadge({ status, className }: ServiceOrderStatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]} className={cn("font-normal", className)}>
      {SERVICE_ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
