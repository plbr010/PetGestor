import type { NotificationType } from "@/features/notifications/types";

const HOURS_BEFORE: Partial<Record<NotificationType, number>> = {
  appointment_reminder_24h: 24,
  appointment_reminder_2h: 2,
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

export function getReminderHoursBefore(type: NotificationType): number | null {
  return HOURS_BEFORE[type] ?? null;
}

export function isActiveAppointmentStatus(status: string): boolean {
  return status === "scheduled" || status === "confirmed";
}
