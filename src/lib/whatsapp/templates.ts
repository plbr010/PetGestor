import type { NotificationType } from "@/features/notifications/types";
import { formatUtcDateInTimezone, formatUtcInTimezone } from "@/lib/timezone";
import type { WhatsAppTemplateParameter } from "@/lib/whatsapp/types";

export type WhatsAppTemplateContext = {
  tutorName: string;
  petName: string;
  serviceName: string;
  companyName: string;
  employeeName: string;
  appointmentStartUtcIso: string;
  timeZone: string;
};

function textParam(value: string): WhatsAppTemplateParameter {
  const text = value.trim().slice(0, 200) || "-";
  return { type: "text", text };
}

function localTime(iso: string, timeZone: string): string {
  return formatUtcInTimezone(iso, timeZone);
}

function localDate(iso: string, timeZone: string): string {
  const dateKey = formatUtcDateInTimezone(iso, timeZone);
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

export function buildWhatsAppTemplateParameters(
  type: NotificationType,
  context: WhatsAppTemplateContext,
): WhatsAppTemplateParameter[] | null {
  const time = localTime(context.appointmentStartUtcIso, context.timeZone);

  switch (type) {
    case "customer_same_day_reminder":
      return [
        textParam(context.tutorName),
        textParam(context.petName),
        textParam(context.serviceName),
        textParam(time),
        textParam(context.companyName),
      ];
    case "appointment_reminder_2h":
      return [
        textParam(context.tutorName),
        textParam(context.petName),
        textParam(time),
      ];
    case "pet_ready":
      return [textParam(context.tutorName), textParam(context.petName)];
    case "employee_same_day_reminder":
      return [
        textParam(context.employeeName),
        textParam(context.petName),
        textParam(time),
        textParam(context.serviceName),
      ];
    case "employee_2h_reminder":
      return [
        textParam(context.petName),
        textParam(time),
        textParam(context.serviceName),
      ];
    case "appointment_confirmation":
      return [
        textParam(context.tutorName),
        textParam(context.petName),
        textParam(localDate(context.appointmentStartUtcIso, context.timeZone)),
        textParam(time),
      ];
    case "appointment_reminder_24h":
      return [
        textParam(context.tutorName),
        textParam(context.petName),
        textParam(time),
      ];
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function toWhatsAppRecipient(e164: string): string {
  return e164.replace(/^\+/, "").replace(/\D/g, "");
}
