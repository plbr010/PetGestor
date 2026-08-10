import Link from "next/link";

import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import type { AppointmentListItem } from "@/features/appointments/types";
import {
  formatAppointmentDateLabel,
  formatPriceSnapshot,
  groupAppointmentsByLocalDate,
} from "@/features/appointments/utils";
import { formatUtcInTimezone } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

type AgendaWeekViewProps = {
  appointments: AppointmentListItem[];
  weekDates: string[];
  timeZone: string;
};

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatWeekdayHeader(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const day = date.split("-")[2];
  return `${WEEKDAY_SHORT[weekday]} ${day}`;
}

export function AgendaWeekView({ appointments, weekDates, timeZone }: AgendaWeekViewProps) {
  const grouped = groupAppointmentsByLocalDate(appointments, timeZone);

  if (appointments.length === 0) {
    return (
      <EmptyState
        title="Nenhum agendamento nesta semana"
        description="Ajuste a data ou crie um novo agendamento."
      />
    );
  }

  return (
    <>
      <div className="hidden gap-3 xl:grid xl:grid-cols-7">
        {weekDates.map((date) => {
          const dayAppointments = grouped.get(date) ?? [];

          return (
            <Card key={date} className="min-h-48">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{formatWeekdayHeader(date)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayAppointments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem agendamentos</p>
                ) : (
                  dayAppointments.map((appointment) => (
                    <Link
                      key={appointment.id}
                      href={`/dashboard/agenda/${appointment.id}`}
                      className="block rounded-lg border bg-muted/20 p-2 text-xs transition hover:border-primary/40"
                    >
                      <p className="font-semibold text-primary">
                        {formatUtcInTimezone(appointment.scheduled_start, timeZone)}
                      </p>
                      <p className="truncate font-medium">{appointment.pet.name}</p>
                      <p className="truncate text-muted-foreground">
                        {appointment.service_name_snapshot}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <AppointmentStatusBadge status={appointment.status} className="text-[10px]" />
                        <span className="font-medium">
                          {formatPriceSnapshot(appointment.price_cents_snapshot)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-6 xl:hidden">
        {weekDates.map((date) => {
          const dayAppointments = grouped.get(date) ?? [];
          if (dayAppointments.length === 0) {
            return null;
          }

          return (
            <section key={date} className="space-y-3">
              <h2 className="text-sm font-semibold">
                {formatAppointmentDateLabel(date, timeZone)}
              </h2>
              <ul className="space-y-2">
                {dayAppointments.map((appointment) => (
                  <li key={appointment.id}>
                    <Link
                      href={`/dashboard/agenda/${appointment.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-primary">
                          {formatUtcInTimezone(appointment.scheduled_start, timeZone)} ·{" "}
                          {appointment.pet.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {appointment.service_name_snapshot} · {appointment.employee.name}
                        </p>
                      </div>
                      <AppointmentStatusBadge status={appointment.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
