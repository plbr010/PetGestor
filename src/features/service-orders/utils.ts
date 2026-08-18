import { SERVICE_ORDER_STATUS_LABELS } from "@/features/service-orders/status";
import type { ServiceOrderListItem } from "@/features/service-orders/types";
import { formatUtcDateInTimezone, formatUtcInTimezone, addDaysToDateString, getTodayInTimezone } from "@/lib/timezone";
import type { ServiceOrderStatus } from "@/types/database.types";

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

/** Timestamp mais representativo do atendimento para exibição e ordenação local. */
export function getServiceOrderActivityAt(
  order: Pick<
    ServiceOrderListItem,
    "completed_at" | "ready_at" | "started_at" | "check_in_at" | "appointment"
  >,
): string {
  return (
    order.completed_at ??
    order.ready_at ??
    order.started_at ??
    order.check_in_at ??
    order.appointment.scheduled_start
  );
}

export function formatDashboardWhenLabel(
  iso: string,
  timeZone: string,
  today = getTodayInTimezone(timeZone),
): string {
  const date = formatUtcDateInTimezone(iso, timeZone);
  const time = formatUtcInTimezone(iso, timeZone);

  if (date === today) {
    return `Hoje, ${time}`;
  }

  const yesterdayKey = addDaysToDateString(today, -1);
  if (date === yesterdayKey) {
    return `Ontem, ${time}`;
  }

  const [, month, day] = date.split("-");
  return `${day}/${month}, ${time}`;
}

export function sortServiceOrdersByRecentActivity(
  orders: ServiceOrderListItem[],
): ServiceOrderListItem[] {
  return [...orders].sort(
    (left, right) =>
      new Date(getServiceOrderActivityAt(right)).getTime() -
      new Date(getServiceOrderActivityAt(left)).getTime(),
  );
}
