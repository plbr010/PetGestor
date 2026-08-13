import { Badge } from "@/components/ui/badge";
import type { AdminAccountStatus } from "@/features/admin/types";
import { adminStatusLabel } from "@/features/admin/utils";
import { cn } from "@/lib/utils";

const statusClassName: Record<AdminAccountStatus, string> = {
  trial: "border-transparent bg-sky-100 text-sky-900",
  active: "border-transparent bg-emerald-100 text-emerald-900",
  past_due: "border-transparent bg-amber-100 text-amber-950",
  cancelled: "border-transparent bg-zinc-200 text-zinc-800",
  blocked: "border-transparent bg-red-100 text-red-900",
};

type AdminStatusBadgeProps = {
  status: AdminAccountStatus;
  className?: string;
};

export function AdminStatusBadge({ status, className }: AdminStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(statusClassName[status], className)}>
      {adminStatusLabel(status)}
    </Badge>
  );
}
