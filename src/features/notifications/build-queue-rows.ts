import { toE164Brazil } from "@/lib/phone";

import {
  computeReminderScheduledFor,
  getReminderHoursBefore,
  isActiveAppointmentStatus,
} from "@/features/notifications/scheduler";
import { renderNotificationMessage } from "@/features/notifications/templates";
import type {
  AppointmentNotificationContext,
  CompanyNotificationSettings,
  NotificationRowDraft,
  NotificationType,
} from "@/features/notifications/types";

type BuildRowsInput = {
  context: AppointmentNotificationContext;
  settings: CompanyNotificationSettings;
  timeZone: string;
  now?: Date;
};

function isTypeEnabled(
  settings: CompanyNotificationSettings,
  type: NotificationType,
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
    default:
      return false;
  }
}

export function buildAppointmentNotificationRows(
  input: BuildRowsInput,
): NotificationRowDraft[] {
  const { context, settings, timeZone, now = new Date() } = input;

  if (!isActiveAppointmentStatus(context.status)) {
    return [];
  }

  const destinationPhone = toE164Brazil(context.customerPhone);
  const templateContext = {
    tutorName: context.customerName,
    petName: context.petName,
    appointmentStartUtcIso: context.scheduledStart,
    timeZone,
  };

  const rows: NotificationRowDraft[] = [];
  const types: NotificationType[] = [
    "appointment_confirmation",
    "appointment_reminder_24h",
    "appointment_reminder_2h",
  ];

  for (const type of types) {
    if (!isTypeEnabled(settings, type)) {
      continue;
    }

    let scheduledFor: string | null;

    if (type === "appointment_confirmation") {
      scheduledFor = now.toISOString();
    } else {
      const hoursBefore = getReminderHoursBefore(type);

      if (hoursBefore == null) {
        continue;
      }

      scheduledFor = computeReminderScheduledFor(
        context.scheduledStart,
        hoursBefore,
        now,
      );
    }

    if (!scheduledFor) {
      continue;
    }

    rows.push({
      company_id: context.companyId,
      customer_id: context.customerId,
      pet_id: context.petId,
      appointment_id: context.appointmentId,
      service_order_id: null,
      type,
      destination_phone: destinationPhone,
      message_body: renderNotificationMessage(type, templateContext),
      scheduled_for: scheduledFor,
      status: "pending",
    });
  }

  return rows;
}

export function buildPetReadyNotificationRow(input: {
  companyId: string;
  customerId: string;
  petId: string;
  serviceOrderId: string;
  customerName: string;
  customerPhone: string;
  petName: string;
  timeZone: string;
  now?: Date;
}): NotificationRowDraft | null {
  const now = input.now ?? new Date();

  return {
    company_id: input.companyId,
    customer_id: input.customerId,
    pet_id: input.petId,
    appointment_id: null,
    service_order_id: input.serviceOrderId,
    type: "pet_ready",
    destination_phone: toE164Brazil(input.customerPhone),
    message_body: renderNotificationMessage("pet_ready", {
      tutorName: input.customerName,
      petName: input.petName,
      appointmentStartUtcIso: now.toISOString(),
      timeZone: input.timeZone,
    }),
    scheduled_for: now.toISOString(),
    status: "pending",
  };
}
