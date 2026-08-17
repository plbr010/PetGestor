"use client";

import { AppointmentRecurrenceBadge } from "@/features/appointments/components/appointment-recurrence-badge";
import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import type { ScheduleTimeBlock } from "@/features/appointments/time-blocks/types";
import type { AppointmentListItem } from "@/features/appointments/types";
import { slotTimeFromClick } from "@/features/appointments/waitlist/utils";
import {
  formatAppointmentDateLabel,
  formatPriceSnapshot,
  SLOT_INTERVAL_MINUTES,
} from "@/features/appointments/utils";
import { formatUtcInTimezone } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AgendaDayViewProps = {
  appointments: AppointmentListItem[];
  timeBlocks: ScheduleTimeBlock[];
  date: string;
  timeZone: string;
  onSlotClick: (time: string) => void;
  onAppointmentClick: (appointment: AppointmentListItem) => void;
};

const HOUR_HEIGHT = 56;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const SLOTS_PER_HOUR = 60 / SLOT_INTERVAL_MINUTES;

function getMinutesFromMidnight(iso: string, timeZone: string): number {
  const time = formatUtcInTimezone(iso, timeZone);
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function AgendaDayView({
  appointments,
  timeBlocks,
  date,
  timeZone,
  onSlotClick,
  onAppointmentClick,
}: AgendaDayViewProps) {
  const activeAppointments = appointments.filter(
    (item) => item.status !== "cancelled" && item.status !== "no_show",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{formatAppointmentDateLabel(date, timeZone)}</p>
        <Button type="button" className="min-h-11 lg:hidden" onClick={() => onSlotClick("09:00")}>
          Agendar horário
        </Button>
      </div>

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

              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, hourIndex) => {
                const hour = DAY_START_HOUR + hourIndex;
                return Array.from({ length: SLOTS_PER_HOUR }, (_, slotIndex) => {
                  const top =
                    hourIndex * HOUR_HEIGHT + (slotIndex * HOUR_HEIGHT) / SLOTS_PER_HOUR;
                  const time = slotTimeFromClick(hour, slotIndex);
                  return (
                    <button
                      key={`${hour}-${slotIndex}`}
                      type="button"
                      aria-label={`Agendar às ${time}`}
                      className="absolute right-0 left-0 border-0 bg-transparent hover:bg-primary/5"
                      style={{
                        top,
                        height: HOUR_HEIGHT / SLOTS_PER_HOUR,
                      }}
                      onClick={() => onSlotClick(time)}
                    />
                  );
                });
              })}

              {timeBlocks.map((block) => {
                const startMinutes = getMinutesFromMidnight(block.block_start, timeZone);
                const endMinutes = getMinutesFromMidnight(block.block_end, timeZone);
                const top = ((startMinutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(
                  ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
                  HOUR_HEIGHT / 4,
                );

                if (startMinutes < DAY_START_HOUR * 60 || startMinutes > DAY_END_HOUR * 60) {
                  return null;
                }

                return (
                  <div
                    key={block.id}
                    className="pointer-events-none absolute right-0 left-0 rounded-md border border-dashed border-muted-foreground/40 bg-muted/50 p-2 text-xs"
                    style={{ top, height }}
                  >
                    <p className="font-medium">{block.reason}</p>
                    {block.employeeName ? (
                      <p className="text-muted-foreground">{block.employeeName}</p>
                    ) : (
                      <p className="text-muted-foreground">Todos</p>
                    )}
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
                  <button
                    key={appointment.id}
                    type="button"
                    className="absolute right-0 left-0 block rounded-lg border bg-card p-3 text-left shadow-sm transition hover:border-primary/40"
                    style={{ top, height, minHeight: HOUR_HEIGHT * 0.75 }}
                    onClick={() => onAppointmentClick(appointment)}
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
                      <div className="shrink-0 space-y-1 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <AppointmentStatusBadge status={appointment.status} />
                          {appointment.recurrence_id ? (
                            <AppointmentRecurrenceBadge compact />
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-medium">
                          {formatPriceSnapshot(appointment.price_cents_snapshot)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <ul className="space-y-3 lg:hidden">
        {appointments.length === 0 ? (
          <li className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum agendamento neste dia. Toque em &quot;Agendar horário&quot; para criar.
          </li>
        ) : (
          appointments.map((appointment) => (
            <li key={appointment.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"
                onClick={() => onAppointmentClick(appointment)}
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
                    <div className="flex flex-col items-end gap-1">
                      <AppointmentStatusBadge status={appointment.status} />
                      {appointment.recurrence_id ? <AppointmentRecurrenceBadge compact /> : null}
                    </div>
                    <p className="mt-2 font-medium">
                      {formatPriceSnapshot(appointment.price_cents_snapshot)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
