import { isValidBrazilianPhone, toE164Brazil } from "@/lib/phone";

import {
  computeReminderScheduledFor,
  computeSameDayReminderScheduledFor,
  getReminderHoursBefore,
  isActiveAppointmentStatus,
  isSameDayReminderType,
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

const CUSTOMER_APPOINTMENT_TYPES: NotificationType[] = [
  "appointment_confirmation",
  "appointment_reminder_24h",
  "customer_same_day_reminder",
  "appointment_reminder_2h",
];

const EMPLOYEE_APPOINTMENT_TYPES: NotificationType[] = [
  "employee_same_day_reminder",
  "employee_2h_reminder",
];

function isTypeEnabled(
  settings: CompanyNotificationSettings,
  type: NotificationType,
): boolean {
  switch (type) {
    case "appointment_confirmation":
      return settings.appointmentConfirmationEnabled;
    case "appointment_reminder_24h":
      return settings.reminder24hEnabled;
    case "customer_same_day_reminder":
      return settings.customerSameDayReminderEnabled;
    case "appointment_reminder_2h":
      return settings.reminder2hEnabled;
    case "pet_ready":
      return settings.petReadyEnabled;
    case "employee_same_day_reminder":
      return settings.employeeSameDayReminderEnabled;
    case "employee_2h_reminder":
      return settings.employeeReminder2hEnabled;
    default:
      return false;
  }
}

function resolveScheduledFor(
  type: NotificationType,
  appointmentStart: string,
  settings: CompanyNotificationSettings,
  timeZone: string,
  now: Date,
): string | null {
  if (type === "appointment_confirmation") {
    return now.toISOString();
  }

  if (isSameDayReminderType(type)) {
    return computeSameDayReminderScheduledFor(
      appointmentStart,
      settings.sameDayReminderTime,
      timeZone,
      now,
    );
  }

  const hoursBefore = getReminderHoursBefore(type);

  if (hoursBefore == null) {
    return null;
  }

  return computeReminderScheduledFor(appointmentStart, hoursBefore, now);
}

function buildRow(input: {
  context: AppointmentNotificationContext;
  type: NotificationType;
  scheduledFor: string;
  destinationPhone: string;
  recipientType: "customer" | "employee";
  employeeId: string | null;
  timeZone: string;
}): NotificationRowDraft {
  return {
    company_id: input.context.companyId,
    customer_id: input.context.customerId,
    pet_id: input.context.petId,
    appointment_id: input.context.appointmentId,
    service_order_id: null,
    employee_id: input.employeeId,
    recipient_type: input.recipientType,
    type: input.type,
    destination_phone: input.destinationPhone,
    message_body: renderNotificationMessage(input.type, {
      tutorName: input.context.customerName,
      petName: input.context.petName,
      serviceName: input.context.serviceName,
      companyName: input.context.companyName,
      employeeName: input.context.employeeName ?? "",
      appointmentStartUtcIso: input.context.scheduledStart,
      timeZone: input.timeZone,
    }),
    scheduled_for: input.scheduledFor,
    status: "pending",
  };
}

export function buildAppointmentNotificationRows(
  input: BuildRowsInput,
): NotificationRowDraft[] {
  const { context, settings, timeZone, now = new Date() } = input;

  if (!isActiveAppointmentStatus(context.status)) {
    return [];
  }

  const rows: NotificationRowDraft[] = [];
  const customerPhoneValid = isValidBrazilianPhone(context.customerPhone);
  const employeePhoneValid =
    Boolean(context.employeeId) &&
    Boolean(context.employeePhone) &&
    isValidBrazilianPhone(context.employeePhone ?? "");

  if (customerPhoneValid) {
    const destinationPhone = toE164Brazil(context.customerPhone);

    for (const type of CUSTOMER_APPOINTMENT_TYPES) {
      if (!isTypeEnabled(settings, type)) {
        continue;
      }

      const scheduledFor = resolveScheduledFor(
        type,
        context.scheduledStart,
        settings,
        timeZone,
        now,
      );

      if (!scheduledFor) {
        continue;
      }

      rows.push(
        buildRow({
          context,
          type,
          scheduledFor,
          destinationPhone,
          recipientType: "customer",
          employeeId: null,
          timeZone,
        }),
      );
    }
  }

  if (employeePhoneValid && context.employeeId && context.employeePhone) {
    const destinationPhone = toE164Brazil(context.employeePhone);

    for (const type of EMPLOYEE_APPOINTMENT_TYPES) {
      if (!isTypeEnabled(settings, type)) {
        continue;
      }

      const scheduledFor = resolveScheduledFor(
        type,
        context.scheduledStart,
        settings,
        timeZone,
        now,
      );

      if (!scheduledFor) {
        continue;
      }

      rows.push(
        buildRow({
          context,
          type,
          scheduledFor,
          destinationPhone,
          recipientType: "employee",
          employeeId: context.employeeId,
          timeZone,
        }),
      );
    }
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
  if (!isValidBrazilianPhone(input.customerPhone)) {
    return null;
  }

  const now = input.now ?? new Date();

  return {
    company_id: input.companyId,
    customer_id: input.customerId,
    pet_id: input.petId,
    appointment_id: null,
    service_order_id: input.serviceOrderId,
    employee_id: null,
    recipient_type: "customer",
    type: "pet_ready",
    destination_phone: toE164Brazil(input.customerPhone),
    message_body: renderNotificationMessage("pet_ready", {
      tutorName: input.customerName,
      petName: input.petName,
      serviceName: "",
      companyName: "",
      employeeName: "",
      appointmentStartUtcIso: now.toISOString(),
      timeZone: input.timeZone,
    }),
    scheduled_for: now.toISOString(),
    status: "pending",
  };
}
