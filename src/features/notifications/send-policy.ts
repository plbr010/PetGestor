import { isValidBrazilianPhone } from "@/lib/phone";
import type { NotificationType } from "@/features/notifications/types";

export const TWO_HOUR_TYPES: NotificationType[] = [
  "appointment_reminder_2h",
  "employee_2h_reminder",
];

const STALE_WINDOWS_MS: Partial<Record<NotificationType, number>> = {
  appointment_reminder_2h: 45 * 60 * 1000,
  employee_2h_reminder: 45 * 60 * 1000,
  customer_same_day_reminder: 3 * 60 * 60 * 1000,
  employee_same_day_reminder: 3 * 60 * 60 * 1000,
  appointment_reminder_24h: 6 * 60 * 60 * 1000,
  appointment_confirmation: 12 * 60 * 60 * 1000,
  pet_ready: 6 * 60 * 60 * 1000,
};

export type NotificationSendDecision =
  | { action: "send" }
  | { action: "cancel"; reason: string }
  | { action: "fail"; reason: string; retryable: boolean };

export type NotificationSendPolicyInput = {
  type: NotificationType;
  scheduledFor: string;
  destinationPhone: string;
  now: Date;
  settingsEnabled: boolean;
  appointmentStatus: string | null;
  appointmentStart: string | null;
  appointmentDeleted: boolean;
};

export function isTypeEnabledBySettings(
  type: NotificationType,
  settings: {
    appointmentConfirmationEnabled: boolean;
    reminder24hEnabled: boolean;
    reminder2hEnabled: boolean;
    petReadyEnabled: boolean;
    customerSameDayReminderEnabled: boolean;
    employeeSameDayReminderEnabled: boolean;
    employeeReminder2hEnabled: boolean;
  },
): boolean {
  switch (type) {
    case "appointment_confirmation":
      return settings.appointmentConfirmationEnabled;
    case "appointment_reminder_24h":
      return settings.reminder24hEnabled;
    case "appointment_reminder_2h":
      return settings.reminder2hEnabled;
    case "pet_ready":
      return settings.petReadyEnabled;
    case "customer_same_day_reminder":
      return settings.customerSameDayReminderEnabled;
    case "employee_same_day_reminder":
      return settings.employeeSameDayReminderEnabled;
    case "employee_2h_reminder":
      return settings.employeeReminder2hEnabled;
    default:
      return false;
  }
}

export function decideNotificationSend(
  input: NotificationSendPolicyInput,
): NotificationSendDecision {
  if (!input.settingsEnabled) {
    return { action: "cancel", reason: "automation_disabled" };
  }

  if (!isValidBrazilianPhone(input.destinationPhone)) {
    return { action: "fail", reason: "invalid_phone", retryable: false };
  }

  if (input.appointmentDeleted) {
    return { action: "cancel", reason: "appointment_not_found" };
  }

  if (input.appointmentStatus === "cancelled") {
    return { action: "cancel", reason: "appointment_cancelled" };
  }

  if (input.appointmentStatus === "no_show") {
    return { action: "cancel", reason: "appointment_no_show" };
  }

  const appointmentStartMs = input.appointmentStart
    ? new Date(input.appointmentStart).getTime()
    : null;
  const nowMs = input.now.getTime();

  if (
    appointmentStartMs !== null &&
    TWO_HOUR_TYPES.includes(input.type) &&
    appointmentStartMs <= nowMs
  ) {
    return { action: "cancel", reason: "appointment_already_started" };
  }

  if (
    appointmentStartMs !== null &&
    (input.type === "customer_same_day_reminder" ||
      input.type === "employee_same_day_reminder") &&
    appointmentStartMs <= nowMs
  ) {
    return { action: "cancel", reason: "appointment_already_started" };
  }

  const staleWindow = STALE_WINDOWS_MS[input.type] ?? 3 * 60 * 60 * 1000;
  const scheduledMs = new Date(input.scheduledFor).getTime();

  if (!Number.isNaN(scheduledMs) && nowMs - scheduledMs > staleWindow) {
    return { action: "cancel", reason: "stale_notification" };
  }

  return { action: "send" };
}

export function computeNextAttemptAt(attempts: number, now: Date): Date {
  const minutes = attempts <= 1 ? 5 : attempts === 2 ? 20 : 60;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export function isClaimableNotification(input: {
  status: string;
  scheduledFor: string;
  nextAttemptAt: string | null;
  claimedAt: string | null;
  attempts: number;
  maxAttempts: number;
  now: Date;
}): boolean {
  const nowMs = input.now.getTime();

  if (input.status === "pending") {
    if (new Date(input.scheduledFor).getTime() > nowMs) {
      return false;
    }

    if (input.nextAttemptAt && new Date(input.nextAttemptAt).getTime() > nowMs) {
      return false;
    }

    return true;
  }

  if (input.status === "processing") {
    if (!input.claimedAt) {
      return false;
    }

    if (input.attempts >= input.maxAttempts) {
      return false;
    }

    return nowMs - new Date(input.claimedAt).getTime() >= 10 * 60 * 1000;
  }

  return false;
}
