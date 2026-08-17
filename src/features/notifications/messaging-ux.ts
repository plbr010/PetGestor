import type { NotificationHistoryItem, NotificationRecipientType } from "@/features/notifications/types";
import { getNotificationDisplayStatus } from "@/features/notifications/display-status";
import { formatUtcDateInTimezone, formatUtcInTimezone } from "@/lib/timezone";

export type WhatsAppPublicStatus = {
  configured: boolean;
  sendEnabled: boolean;
  checkedAt: string;
};

export type WhatsAppIntegrationTone = "active" | "pending" | "disabled";

export type WhatsAppIntegrationPresentation = {
  tone: WhatsAppIntegrationTone;
  title: string;
  badge: string;
  integrationLabel: "Ativa" | "Pendente";
  sendLabel: "Ativo" | "Desativado";
};

export function getWhatsAppIntegrationPresentation(
  status: Pick<WhatsAppPublicStatus, "configured" | "sendEnabled">,
): WhatsAppIntegrationPresentation {
  if (!status.configured) {
    return {
      tone: "pending",
      title: "WhatsApp ainda não configurado",
      badge: "Configuração pendente",
      integrationLabel: "Pendente",
      sendLabel: "Desativado",
    };
  }

  if (!status.sendEnabled) {
    return {
      tone: "disabled",
      title: "Envios desativados",
      badge: "Desativado",
      integrationLabel: "Ativa",
      sendLabel: "Desativado",
    };
  }

  return {
    tone: "active",
    title: "WhatsApp conectado",
    badge: "Ativo",
    integrationLabel: "Ativa",
    sendLabel: "Ativo",
  };
}

export function subtractHoursFromTime(time: string, hours: number): string {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return time;
  }

  const total = (hour * 60 + minute - hours * 60 + 24 * 60) % (24 * 60);
  const nextHour = String(Math.floor(total / 60)).padStart(2, "0");
  const nextMinute = String(total % 60).padStart(2, "0");
  return `${nextHour}:${nextMinute}`;
}

export function formatNotificationWhen(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const time = formatUtcInTimezone(iso, timeZone);
  const dateKey = formatUtcDateInTimezone(iso, timeZone);
  const todayKey = formatUtcDateInTimezone(now.toISOString(), timeZone);

  if (dateKey === todayKey) {
    return `Hoje ${time}`;
  }

  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year} ${time}`;
}

export function formatCheckedAt(iso: string, timeZone: string): string {
  return formatNotificationWhen(iso, timeZone);
}

export type LastMessageSummary = {
  outcome: "success" | "failed" | "simulated" | "none";
  label: string;
  at: string | null;
};

export function summarizeLastMessage(
  items: NotificationHistoryItem[],
  timeZone: string,
  now: Date = new Date(),
): LastMessageSummary {
  const processed = items.find((item) => {
    const display = getNotificationDisplayStatus(item);
    return display !== "pending" && display !== "processing" && display !== "cancelled";
  });

  if (!processed) {
    return { outcome: "none", label: "Ainda não houve envio", at: null };
  }

  const display = getNotificationDisplayStatus(processed);
  const at =
    processed.readAt ??
    processed.deliveredAt ??
    processed.failedAt ??
    processed.scheduledFor;

  if (display === "failed") {
    return {
      outcome: "failed",
      label: `Falha · ${formatNotificationWhen(at, timeZone, now)}`,
      at,
    };
  }

  if (display === "simulated") {
    return {
      outcome: "simulated",
      label: `Simulação · ${formatNotificationWhen(at, timeZone, now)}`,
      at,
    };
  }

  return {
    outcome: "success",
    label: `Sucesso · ${formatNotificationWhen(at, timeZone, now)}`,
    at,
  };
}

export function getHistoryRecipientLine(
  recipientType: NotificationRecipientType,
  petName: string,
): string {
  if (recipientType === "employee") {
    return "Funcionário";
  }

  return petName && petName !== "—" ? `Tutor do ${petName}` : "Tutor";
}

export const HISTORY_TYPE_LABELS: Record<NotificationHistoryItem["type"], string> = {
  appointment_confirmation: "Confirmação",
  appointment_reminder_24h: "Lembrete 24h",
  customer_same_day_reminder: "Lembrete do dia",
  appointment_reminder_2h: "Lembrete 2h",
  pet_ready: "Pet pronto",
  employee_same_day_reminder: "Lembrete do dia",
  employee_2h_reminder: "Lembrete 2h",
};

export type MessagePreviewExample = {
  sender: string;
  whenLabel: string;
  body: string;
};

export function buildMessagePreviewExamples(input: {
  companyName: string;
  sameDayReminderTime: string;
}): Record<
  | "customer_same_day_reminder"
  | "appointment_reminder_2h"
  | "pet_ready"
  | "employee_same_day_reminder"
  | "employee_2h_reminder"
  | "appointment_confirmation"
  | "appointment_reminder_24h",
  MessagePreviewExample
> {
  const shop = input.companyName.trim() || "seu pet shop";
  const twoHoursBefore = subtractHoursFromTime("15:00", 2);

  return {
    customer_same_day_reminder: {
      sender: "PetGestor",
      whenLabel: `Hoje ${input.sameDayReminderTime}`,
      body: `Olá, Maria! Passando para lembrar que Thor tem banho agendado hoje às 15:00 na ${shop}.`,
    },
    appointment_reminder_2h: {
      sender: "PetGestor",
      whenLabel: `Hoje ${twoHoursBefore}`,
      body: "Olá, Maria! O atendimento de Thor começa daqui a 2 horas, às 15:00.",
    },
    pet_ready: {
      sender: "PetGestor",
      whenLabel: "Agora",
      body: "Olá, Maria! Thor já está pronto e pode ser buscado.",
    },
    employee_same_day_reminder: {
      sender: "PetGestor",
      whenLabel: `Hoje ${input.sameDayReminderTime}`,
      body: "Olá, João! Você tem atendimento de Thor hoje às 15:00. Serviço: Banho.",
    },
    employee_2h_reminder: {
      sender: "PetGestor",
      whenLabel: `Hoje ${twoHoursBefore}`,
      body: "Lembrete: atendimento de Thor em 2 horas, às 15:00. Serviço: Banho.",
    },
    appointment_confirmation: {
      sender: "PetGestor",
      whenLabel: "Ao agendar",
      body: "Olá, Maria! O agendamento de Thor está confirmado para 20/08/2026 às 15:00.",
    },
    appointment_reminder_24h: {
      sender: "PetGestor",
      whenLabel: "1 dia antes",
      body: "Olá, Maria! Passando para lembrar que Thor tem atendimento amanhã às 15:00.",
    },
  };
}
