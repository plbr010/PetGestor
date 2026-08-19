import Link from "next/link";

import { PetAvatar } from "@/components/shared/pet-avatar";
import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import type { AppointmentListItem } from "@/features/appointments/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatUtcInTimezone } from "@/lib/timezone";

type DashboardAppointmentsListProps = {
  appointments: AppointmentListItem[];
  timeZone: string;
};

export function DashboardAppointmentsList({
  appointments,
  timeZone,
}: DashboardAppointmentsListProps) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Próximos atendimentos</CardTitle>
        <CardDescription>Agendamentos confirmados ou pendentes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendimento próximo.</p>
        ) : (
          appointments.map((item, index) => (
            <div key={item.id}>
              <Link
                href={`/dashboard/agenda/${item.id}`}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PetAvatar name={item.pet.name} photoUrl={item.pet.photoThumbUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="font-medium">{item.pet.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.service_name_snapshot} · {item.customer.name}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-primary">
                    {formatUtcInTimezone(item.scheduled_start, timeZone)}
                  </span>
                  <AppointmentStatusBadge status={item.status} />
                </div>
              </Link>
              {index < appointments.length - 1 ? <Separator className="mt-4" /> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
