import { shiftCapacityMinutes, type WorkingHourWindow } from "@/features/appointments/working-hours";
import {
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  getWeekdayInTimezone,
  resolveCompanyTimeZone,
} from "@/lib/timezone";

import { countWeekdaysInCivilRange, weekdayOfCivilDate } from "./period";
import { safePercent } from "./math";
import type { OccupancyReport } from "./types";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const HOUR_BANDS = ["08-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22"];

const RESERVED_STATUSES = new Set(["scheduled", "confirmed", "in_progress", "completed", "no_show"]);

export type OccupancyAppointment = {
  id: string;
  scheduled_start: string;
  status: string;
  duration_minutes_snapshot: number | null;
  employee_id: string | null;
};

export type OccupancyWorkingHour = {
  employee_id: string;
  weekday: number;
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

type MinuteInterval = { start: number; end: number };

function parseClockToMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function mergeOccupiedMinutes(intervals: MinuteInterval[]): number {
  const valid = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (valid.length === 0) {
    return 0;
  }

  let occupied = 0;
  let currentStart = valid[0]!.start;
  let currentEnd = valid[0]!.end;

  for (let index = 1; index < valid.length; index += 1) {
    const next = valid[index]!;
    if (next.start < currentEnd) {
      currentEnd = Math.max(currentEnd, next.end);
      continue;
    }
    occupied += currentEnd - currentStart;
    currentStart = next.start;
    currentEnd = next.end;
  }

  occupied += currentEnd - currentStart;
  return occupied;
}

function appointmentDuration(appointment: OccupancyAppointment): number {
  return Math.max(0, appointment.duration_minutes_snapshot ?? 0);
}

function appointmentLocalInterval(
  appointment: OccupancyAppointment,
  timeZone: string,
): { date: string; weekday: number; start: number; end: number; duration: number } {
  const duration = appointmentDuration(appointment);
  const date = formatUtcDateInTimezone(appointment.scheduled_start, timeZone);
  const clock = formatUtcInTimezone(appointment.scheduled_start, timeZone);
  const start = parseClockToMinutes(clock);
  return {
    date,
    weekday: getWeekdayInTimezone(appointment.scheduled_start, timeZone),
    start,
    end: start + duration,
    duration,
  };
}

function toWorkingWindow(row: OccupancyWorkingHour): WorkingHourWindow {
  return {
    enabled: row.enabled,
    startTime: row.start_time,
    endTime: row.end_time,
    breakStart: row.break_start,
    breakEnd: row.break_end,
  };
}

/**
 * Unidade única: minutos.
 * Capacidade = (jornada − intervalo válido) × ocorrências reais do weekday no período civil.
 * Reservado = agendamentos que ocupam a agenda (não cancelados), com overlap mesclado por colaborador/dia.
 * Realizado = somente completed.
 */
export function computeOccupancy(
  appointments: OccupancyAppointment[],
  workingHours: OccupancyWorkingHour[],
  period: { from: string; to: string },
  timeZone: string,
): OccupancyReport {
  const safeTimeZone = resolveCompanyTimeZone(timeZone);
  const weekdayOccurrences = countWeekdaysInCivilRange(period.from, period.to);

  let capacityMinutes = 0;
  const weekdayCapacity = new Map<number, number>();

  for (const row of workingHours) {
    const minutes = shiftCapacityMinutes(toWorkingWindow(row));
    if (minutes <= 0) {
      continue;
    }
    const occurrences = weekdayOccurrences[row.weekday] ?? 0;
    const contribution = minutes * occurrences;
    capacityMinutes += contribution;
    weekdayCapacity.set(row.weekday, (weekdayCapacity.get(row.weekday) ?? 0) + contribution);
  }

  const reservedByResource = new Map<string, MinuteInterval[]>();
  const servedByResource = new Map<string, MinuteInterval[]>();
  const weekdayReservedMinutes = new Map<number, number>();
  const weekdayServedMinutes = new Map<number, number>();
  const weekdayReservedCount = new Map<number, number>();
  const hourBandCounts = new Map<string, number>();

  let noShowMinutes = 0;
  let cancelledMinutes = 0;
  let reservedAppointmentCount = 0;
  let servedAppointmentCount = 0;
  let noShowCount = 0;
  let cancelledCount = 0;

  for (const appointment of appointments) {
    const interval = appointmentLocalInterval(appointment, safeTimeZone);
    const resourceKey = `${appointment.employee_id ?? "unassigned"}:${interval.date}`;

    if (appointment.status === "cancelled") {
      cancelledMinutes += interval.duration;
      cancelledCount += 1;
      continue;
    }

    if (appointment.status === "no_show") {
      noShowMinutes += interval.duration;
      noShowCount += 1;
    }

    if (RESERVED_STATUSES.has(appointment.status)) {
      const list = reservedByResource.get(resourceKey) ?? [];
      list.push({ start: interval.start, end: interval.end });
      reservedByResource.set(resourceKey, list);
      weekdayReservedCount.set(interval.weekday, (weekdayReservedCount.get(interval.weekday) ?? 0) + 1);
      reservedAppointmentCount += 1;

      const hour = Math.floor(interval.start / 60);
      const bandStart = Math.floor(hour / 2) * 2;
      const band = `${String(bandStart).padStart(2, "0")}-${String(bandStart + 2).padStart(2, "0")}`;
      if (HOUR_BANDS.includes(band)) {
        hourBandCounts.set(band, (hourBandCounts.get(band) ?? 0) + 1);
      }
    }

    if (appointment.status === "completed") {
      const list = servedByResource.get(resourceKey) ?? [];
      list.push({ start: interval.start, end: interval.end });
      servedByResource.set(resourceKey, list);
      // minutos realizados por weekday são mesclados depois, por colaborador/dia
      servedAppointmentCount += 1;
    }
  }

  let reservedMinutes = 0;
  for (const [resourceKey, intervals] of reservedByResource) {
    const merged = mergeOccupiedMinutes(intervals);
    reservedMinutes += merged;
    const date = resourceKey.slice(resourceKey.indexOf(":") + 1);
    const weekday = weekdayOfCivilDate(date);
    weekdayReservedMinutes.set(weekday, (weekdayReservedMinutes.get(weekday) ?? 0) + merged);
  }

  let servedMinutes = 0;
  for (const [resourceKey, intervals] of servedByResource) {
    const merged = mergeOccupiedMinutes(intervals);
    servedMinutes += merged;
    const date = resourceKey.slice(resourceKey.indexOf(":") + 1);
    const weekday = weekdayOfCivilDate(date);
    weekdayServedMinutes.set(weekday, (weekdayServedMinutes.get(weekday) ?? 0) + merged);
  }

  const byWeekday = Array.from({ length: 7 }, (_, weekday) => {
    const capacity = weekdayCapacity.get(weekday) ?? 0;
    const reserved = weekdayReservedMinutes.get(weekday) ?? 0;
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday] ?? String(weekday),
      percent: safePercent(reserved, capacity),
      count: weekdayReservedCount.get(weekday) ?? 0,
      capacityMinutes: capacity,
      reservedMinutes: reserved,
      servedMinutes: weekdayServedMinutes.get(weekday) ?? 0,
    };
  });

  return {
    overallPercent: safePercent(reservedMinutes, capacityMinutes),
    overallServedPercent: safePercent(servedMinutes, capacityMinutes),
    capacityMinutes,
    reservedMinutes,
    servedMinutes,
    noShowMinutes,
    cancelledMinutes,
    totalSlotsAvailable: capacityMinutes,
    totalSlotsUsed: reservedMinutes,
    reservedAppointmentCount,
    servedAppointmentCount,
    noShowCount,
    cancelledCount,
    byWeekday,
    byHourBand: HOUR_BANDS.map((band) => ({
      band,
      count: hourBandCounts.get(band) ?? 0,
    })),
  };
}
