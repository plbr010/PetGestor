import {
  formatUtcDateInTimezone,
  formatUtcInTimezone,
} from "@/lib/timezone";

import type { NotificationType } from "@/features/notifications/types";

export type MessageTemplateContext = {
  tutorName: string;
  petName: string;
  appointmentStartUtcIso: string;
  timeZone: string;
};

function formatLocalDatePtBr(isoUtc: string, timeZone: string): string {
  const dateKey = formatUtcDateInTimezone(isoUtc, timeZone);
  const date = new Date(`${dateKey}T12:00:00`);

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatLocalTime(isoUtc: string, timeZone: string): string {
  return formatUtcInTimezone(isoUtc, timeZone);
}

export function renderNotificationMessage(
  type: NotificationType,
  context: MessageTemplateContext,
): string {
  const { tutorName, petName, appointmentStartUtcIso, timeZone } = context;
  const time = formatLocalTime(appointmentStartUtcIso, timeZone);

  switch (type) {
    case "appointment_confirmation": {
      const date = formatLocalDatePtBr(appointmentStartUtcIso, timeZone);
      return `Olá, ${tutorName}! O agendamento de ${petName} está confirmado para ${date} às ${time}.`;
    }
    case "appointment_reminder_24h":
      return `Olá, ${tutorName}! Passando para lembrar que ${petName} tem atendimento amanhã às ${time}.`;
    case "appointment_reminder_2h":
      return `Olá, ${tutorName}! O atendimento de ${petName} está marcado para hoje às ${time}.`;
    case "pet_ready":
      return `Olá, ${tutorName}! ${petName} já está pronto(a).`;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  appointment_confirmation: "Confirmação de agendamento",
  appointment_reminder_24h: "Lembrete 24h antes",
  appointment_reminder_2h: "Lembrete 2h antes",
  pet_ready: "Pet pronto",
};

export const NOTIFICATION_STATUS_LABELS: Record<
  import("@/features/notifications/types").NotificationStatus,
  string
> = {
  pending: "Pendente",
  processing: "Processando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};
