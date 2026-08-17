import { formatUtcDateInTimezone, localDateTimeToUtcIso } from "@/lib/timezone";

import type { NotificationType } from "@/features/notifications/types";

const HOURS_BEFORE: Partial<Record<NotificationType, number>> = {
  appointment_reminder_24h: 24,
  appointment_reminder_2h: 2,
  employee_2h_reminder: 2,
};

export function computeReminderScheduledFor(
  appointmentStartUtcIso: string,
  hoursBefore: number,
  now: Date = new Date(),
): string | null {
  const appointmentMs = new Date(appointmentStartUtcIso).getTime();

  if (Number.isNaN(appointmentMs)) {
    return null;
  }

  const scheduledMs = appointmentMs - hoursBefore * 60 * 60 * 1000;

  if (scheduledMs <= now.getTime()) {
    return null;
  }

  return new Date(scheduledMs).toISOString();
}

export function normalizeSameDayReminderTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());

  if (!match) {
    return "08:00";
  }

  return `${match[1]}:${match[2]}`;
}

export function computeSameDayReminderScheduledFor(
  appointmentStartUtcIso: string,
  sameDayTime: string,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  const appointmentMs = new Date(appointmentStartUtcIso).getTime();

  if (Number.isNaN(appointmentMs)) {
    return null;
  }

  const localDate = formatUtcDateInTimezone(appointmentStartUtcIso, timeZone);
  const time = normalizeSameDayReminderTime(sameDayTime);
  const scheduledFor = localDateTimeToUtcIso(localDate, time, timeZone);
  const scheduledMs = new Date(scheduledFor).getTime();

  if (scheduledMs <= now.getTime()) {
    return null;
  }

  if (scheduledMs >= appointmentMs) {
    return null;
  }

  return scheduledFor;
}

export function getReminderHoursBefore(type: NotificationType): number | null {
  return HOURS_BEFORE[type] ?? null;
}

export function isActiveAppointmentStatus(status: string): boolean {
  return status === "scheduled" || status === "confirmed";
}

export function isSameDayReminderType(type: NotificationType): boolean {
  return type === "customer_same_day_reminder" || type === "employee_same_day_reminder";
}
