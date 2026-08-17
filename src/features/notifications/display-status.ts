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
  pending: "Agendada",
  processing: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  cancelled: "Cancelada",
  simulated: "Simulação",
};

export function getFriendlyNotificationError(
  codeOrMessage: string | null,
  recipientType?: "customer" | "employee",
): string | null {
  if (!codeOrMessage) {
    return null;
  }

  const value = codeOrMessage.toLowerCase();

  if (value.includes("invalid_phone")) {
    return recipientType === "employee"
      ? "Telefone do funcionário inválido."
      : "Telefone do tutor inválido.";
  }

  if (value.includes("template_not_configured") || value.includes("132001") || value.includes("132000")) {
    return "Template de mensagem indisponível.";
  }

  if (value.includes("whatsapp_not_configured")) {
    return "WhatsApp ainda não está configurado.";
  }

  if (
    value.includes("timeout") ||
    value.includes("network") ||
    value.includes("429") ||
    value.includes("503") ||
    value.includes("500")
  ) {
    return "Mensagem não pôde ser enviada. O sistema tentará novamente.";
  }

  if (value.includes("whatsapp_send_disabled")) {
    return "Envio automático está desativado. A mensagem não foi enviada de verdade.";
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
