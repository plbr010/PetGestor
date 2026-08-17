import {
  formatUtcDateInTimezone,
  formatUtcInTimezone,
} from "@/lib/timezone";

import type { NotificationType } from "@/features/notifications/types";

export type MessageTemplateContext = {
  tutorName: string;
  petName: string;
  serviceName: string;
  companyName: string;
  employeeName: string;
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
  const {
    tutorName,
    petName,
    serviceName,
    companyName,
    employeeName,
    appointmentStartUtcIso,
    timeZone,
  } = context;
  const time = formatLocalTime(appointmentStartUtcIso, timeZone);

  switch (type) {
    case "appointment_confirmation": {
      const date = formatLocalDatePtBr(appointmentStartUtcIso, timeZone);
      return `Olá, ${tutorName}! O agendamento de ${petName} está confirmado para ${date} às ${time}.`;
    }
    case "appointment_reminder_24h":
      return `Olá, ${tutorName}! Passando para lembrar que ${petName} tem atendimento amanhã às ${time}.`;
    case "customer_same_day_reminder":
      return `Olá, ${tutorName}! Passando para lembrar que ${petName} tem ${serviceName} agendado hoje às ${time} na ${companyName}. 🐾`;
    case "appointment_reminder_2h":
      return `Olá, ${tutorName}! O atendimento de ${petName} começa daqui a 2 horas, às ${time}. Estamos te esperando! 😊`;
    case "pet_ready":
      return `Olá, ${tutorName}! ${petName} já está pronto(a) e pode ser buscado(a). 🐾`;
    case "employee_same_day_reminder":
      return `Olá, ${employeeName}! Você tem atendimento de ${petName} hoje às ${time}. Serviço: ${serviceName}.`;
    case "employee_2h_reminder":
      return `Lembrete: atendimento de ${petName} em 2 horas, às ${time}. Serviço: ${serviceName}.`;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  appointment_confirmation: "Confirmação de agendamento",
  appointment_reminder_24h: "Lembrete 24h antes",
  customer_same_day_reminder: "Lembrete no dia",
  appointment_reminder_2h: "Lembrete 2h antes",
  pet_ready: "Pet pronto",
  employee_same_day_reminder: "Lembrete no dia (equipe)",
  employee_2h_reminder: "Lembrete 2h antes (equipe)",
};

export const NOTIFICATION_RECIPIENT_LABELS: Record<"customer" | "employee", string> = {
  customer: "Tutor",
  employee: "Funcionário",
};

export const NOTIFICATION_STATUS_LABELS: Record<
  import("@/features/notifications/types").NotificationStatus,
  string
> = {
  pending: "Agendada",
  processing: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
  simulated: "Simulação",
};
