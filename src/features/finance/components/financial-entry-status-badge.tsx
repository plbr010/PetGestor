import { FINANCIAL_ENTRY_STATUS_LABELS } from "@/features/finance/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FinancialEntryStatus } from "@/types/database.types";

const statusVariant: Record<
  FinancialEntryStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  paid: "default",
  cancelled: "secondary",
};

type FinancialEntryStatusBadgeProps = {
  status: FinancialEntryStatus;
  className?: string;
};

export function FinancialEntryStatusBadge({
  status,
  className,
}: FinancialEntryStatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]} className={cn("font-normal", className)}>
      {FINANCIAL_ENTRY_STATUS_LABELS[status]}
    </Badge>
  );
}
