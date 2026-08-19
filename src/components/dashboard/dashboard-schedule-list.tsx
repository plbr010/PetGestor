import Link from "next/link";

import { PetAvatar } from "@/components/shared/pet-avatar";
import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import type { AppointmentListItem } from "@/features/appointments/types";
import { formatPriceSnapshot } from "@/features/appointments/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUtcInTimezone } from "@/lib/timezone";

type DashboardScheduleListProps = {
  appointments: AppointmentListItem[];
  timeZone: string;
};

export function DashboardScheduleList({
  appointments,
  timeZone,
}: DashboardScheduleListProps) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Agenda de hoje</CardTitle>
        <CardDescription>Atendimentos agendados para hoje</CardDescription>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard/agenda/${item.id}`}
                  className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-[10px] font-medium uppercase">Hora</span>
                      <span className="text-sm font-bold">
                        {formatUtcInTimezone(item.scheduled_start, timeZone)}
                      </span>
                    </div>
                    <PetAvatar name={item.pet.name} photoUrl={item.pet.photoThumbUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium">{item.pet.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.service_name_snapshot} · {item.customer.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="text-sm font-medium">
                      {formatPriceSnapshot(item.price_cents_snapshot)}
                    </span>
                    <AppointmentStatusBadge status={item.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
