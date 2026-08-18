import { STOCK_STATUS_LABELS, type StockStatus } from "@/features/inventory/stock-engine";
import { stockStatusBadgeVariant } from "@/features/inventory/utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StockStatusBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={stockStatusBadgeVariant(status)}
      className={cn(
        status === "low" &&
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        className,
      )}
    >
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}
