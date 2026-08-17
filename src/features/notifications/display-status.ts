import type { NotificationStatus } from "@/features/notifications/types";

export type NotificationDisplayStatus =
  | NotificationStatus
  | "delivered"
  | "read";

export function getNotificationDisplayStatus(item: {
  status: NotificationStatus;
  deliveredAt?: string | null;
  readAt?: string | null;
}): NotificationDisplayStatus {
  if (item.status === "failed" || item.status === "cancelled" || item.status === "simulated") {
    return item.status;
  }

  if (item.readAt) {
    return "read";
  }

  if (item.deliveredAt) {
    return "delivered";
  }

  return item.status;
}

export const NOTIFICATION_DISPLAY_STATUS_LABELS: Record<NotificationDisplayStatus, string> = {
  pending: "Pendente",
  processing: "Processando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  cancelled: "Cancelada",
  simulated: "Simulação (não enviada)",
};

export function getFriendlyNotificationError(codeOrMessage: string | null): string | null {
  if (!codeOrMessage) {
    return null;
  }

  const value = codeOrMessage.toLowerCase();

  if (value.includes("invalid_phone")) {
    return "Telefone inválido. Atualize o número no cadastro.";
  }

  if (value.includes("template_not_configured") || value.includes("132001") || value.includes("132000")) {
    return "Modelo de mensagem ainda não configurado na Meta.";
  }

  if (value.includes("whatsapp_not_configured")) {
    return "WhatsApp ainda não está configurado.";
  }

  if (value.includes("whatsapp_send_disabled")) {
    return "Envio real desligado (modo de teste).";
  }

  if (value.includes("automation_disabled")) {
    return "Esta automação está desativada.";
  }

  if (value.includes("appointment_cancelled") || value.includes("appointment_no_show")) {
    return "O agendamento foi cancelado ou marcado como falta.";
  }

  if (value.includes("appointment_already_started") || value.includes("stale")) {
    return "O horário do lembrete já passou.";
  }

  return "Não foi possível enviar a mensagem.";
}
