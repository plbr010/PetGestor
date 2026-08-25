import { SERVICE_ORDER_STATUS_LABELS } from "@/features/service-orders/status";
import { formatUtcInTimezone } from "@/lib/timezone";
import type { ServiceOrderStatus } from "@/types/database.types";
import { getTodayInTimezone } from "@/lib/timezone";

export function mapServiceOrderError(message: string | undefined): string {
  const code = message ?? "";

  if (code.includes("appointment_not_eligible")) {
    return "Este agendamento não pode receber check-in.";
  }

  if (code.includes("appointment_not_found") || code.includes("service_order_not_found")) {
    return "Não foi possível encontrar o registro solicitado.";
  }

  if (code.includes("invalid_status_transition")) {
    return "Esta ação não é permitida no status atual.";
  }

  if (code.includes("service_order_not_cancellable")) {
    return "Somente atendimentos aguardando podem ser cancelados.";
  }

  if (code.includes("service_order_not_editable")) {
    return "Esta ordem não pode mais ser editada.";
  }

  if (code.includes("consumption_already_applied")) {
    return "Este consumo já foi baixado do estoque e não pode ser alterado.";
  }

  if (code.includes("invalid_consumption_quantity")) {
    return "Informe uma quantidade válida.";
  }

  if (code.includes("product_not_found")) {
    return "Produto não encontrado ou inativo.";
  }

  if (code.includes("insufficient_stock")) {
    const parts = code.split("|");
    if (parts.length >= 4) {
      const productName = parts[1];
      const needed = parts[2];
      const available = parts[3];
      return `Estoque insuficiente de ${productName}. Necessário: ${needed}. Disponível: ${available}.`;
    }
    return "Estoque insuficiente para um ou mais insumos deste atendimento.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}

export function getStatusLabel(status: ServiceOrderStatus): string {
  return SERVICE_ORDER_STATUS_LABELS[status];
}

export function parseServiceOrderDate(
  value: string | undefined | null,
  timeZone: string,
): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return getTodayInTimezone(timeZone);
}

export function formatElapsedSince(iso: string, now = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);

  if (totalMinutes < 1) {
    return "agora";
  }

  if (totalMinutes < 60) {
    return `há ${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `há ${hours}h`;
  }

  return `há ${hours}h ${minutes}min`;
}

export function formatCheckInLabel(checkInAt: string, timeZone: string): string {
  return `Chegou ${formatUtcInTimezone(checkInAt, timeZone)}`;
}

export function formatTimestampLabel(
  iso: string | null,
  timeZone: string,
  prefix: string,
): string {
  if (!iso) {
    return "—";
  }

  return `${prefix} ${formatUtcInTimezone(iso, timeZone)}`;
}

export function buildAtendimentosHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/dashboard/atendimentos?${query}` : "/dashboard/atendimentos";
}
