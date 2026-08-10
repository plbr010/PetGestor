import Link from "next/link";

import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import type { AppointmentListItem } from "@/features/appointments/types";
import {
  formatAppointmentDateLabel,
  formatPriceSnapshot,
} from "@/features/appointments/utils";
import { formatUtcInTimezone } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

type AgendaDayViewProps = {
  appointments: AppointmentListItem[];
  date: string;
  timeZone: string;
};

const HOUR_HEIGHT = 56;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;

function getMinutesFromMidnight(iso: string, timeZone: string): number {
  const time = formatUtcInTimezone(iso, timeZone);
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function AgendaDayView({ appointments, date, timeZone }: AgendaDayViewProps) {
  const activeAppointments = appointments.filter(
    (item) => item.status !== "cancelled" && item.status !== "no_show",
  );

  if (appointments.length === 0) {
    return (
      <EmptyState
        title="Nenhum agendamento neste dia"
        description="Crie um novo agendamento para preencher a agenda."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{formatAppointmentDateLabel(date, timeZone)}</p>

      <div className="hidden lg:block">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="relative border-l pl-12"
              style={{ minHeight: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
            >
              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => {
                const hour = DAY_START_HOUR + index;
                return (
                  <div
                    key={hour}
                    className="absolute left-0 w-full border-t text-xs text-muted-foreground"
                    style={{ top: index * HOUR_HEIGHT }}
                  >
                    <span className="absolute -left-12 -top-2 w-10 text-right">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                );
              })}

              {activeAppointments.map((appointment) => {
                const startMinutes = getMinutesFromMidnight(appointment.scheduled_start, timeZone);
                const endMinutes = getMinutesFromMidnight(appointment.scheduled_end, timeZone);
                const top = ((startMinutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(
                  ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
                  HOUR_HEIGHT * 0.75,
                );

                if (startMinutes < DAY_START_HOUR * 60 || startMinutes > DAY_END_HOUR * 60) {
                  return null;
                }

                return (
                  <Link
                    key={appointment.id}
                    href={`/dashboard/agenda/${appointment.id}`}
                    className="absolute right-0 left-0 block rounded-lg border bg-card p-3 shadow-sm transition hover:border-primary/40"
                    style={{ top, height, minHeight: HOUR_HEIGHT * 0.75 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {formatUtcInTimezone(appointment.scheduled_start, timeZone)} ·{" "}
                          {appointment.pet.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {appointment.service_name_snapshot} · {appointment.customer.name} ·{" "}
                          {appointment.employee.name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <AppointmentStatusBadge status={appointment.status} />
                        <p className="mt-1 text-sm font-medium">
                          {formatPriceSnapshot(appointment.price_cents_snapshot)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <ul className="space-y-3 lg:hidden">
        {appointments.map((appointment) => (
          <li key={appointment.id}>
            <Link
              href={`/dashboard/agenda/${appointment.id}`}
              className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-primary">
                    {formatUtcInTimezone(appointment.scheduled_start, timeZone)}
                  </p>
                  <p className="font-medium">{appointment.pet.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {appointment.customer.name} · {appointment.service_name_snapshot}
                  </p>
                  <p className="text-sm text-muted-foreground">{appointment.employee.name}</p>
                </div>
                <div className="text-right">
                  <AppointmentStatusBadge status={appointment.status} />
                  <p className="mt-2 font-medium">
                    {formatPriceSnapshot(appointment.price_cents_snapshot)}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
