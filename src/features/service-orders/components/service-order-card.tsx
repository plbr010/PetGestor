import Link from "next/link";

import { PetAvatar } from "@/components/shared/pet-avatar";
import { ServiceOrderStatusBadge } from "@/features/service-orders/components/service-order-status-badge";
import type { ServiceOrderListItem } from "@/features/service-orders/types";
import {
  formatCheckInLabel,
  formatElapsedSince,
} from "@/features/service-orders/utils";
import { formatUtcInTimezone } from "@/lib/timezone";

type ServiceOrderCardProps = {
  order: ServiceOrderListItem;
  timeZone: string;
};

export function ServiceOrderCard({ order, timeZone }: ServiceOrderCardProps) {
  const elapsedSource =
    order.status === "in_progress" && order.started_at
      ? order.started_at
      : order.check_in_at;

  return (
    <Link
      href={`/dashboard/atendimentos/${order.id}`}
      className="block rounded-xl border bg-card p-4 transition hover:border-primary/40"
    >
      <div className="flex items-start gap-3">
        <PetAvatar
          name={order.appointment.pet.name}
          photoUrl={order.appointment.pet.photoThumbUrl}
          size="sm"
        />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{order.appointment.pet.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {order.appointment.customer.name}
          </p>
          <p className="mt-1 truncate text-sm">{order.appointment.service_name_snapshot}</p>
          <p className="text-sm text-muted-foreground">{order.appointment.employee.name}</p>
        </div>
        <ServiceOrderStatusBadge status={order.status} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatUtcInTimezone(order.appointment.scheduled_start, timeZone)}</span>
        <span>·</span>
        <span>{formatCheckInLabel(order.check_in_at, timeZone)}</span>
        {order.status === "waiting" || order.status === "in_progress" ? (
          <>
            <span>·</span>
            <span>{formatElapsedSince(elapsedSource)}</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
