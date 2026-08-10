import type { ServiceOrderStatus } from "@/types/database.types";
import type { AppointmentStatus } from "@/types/database.types";

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  ready: "Pronto para buscar",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  waiting: ["in_progress", "cancelled"],
  in_progress: ["ready"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransitionServiceOrderStatus(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isActiveServiceOrderStatus(status: ServiceOrderStatus): boolean {
  return status === "waiting" || status === "in_progress" || status === "ready";
}

export function isNotesEditableStatus(status: ServiceOrderStatus): boolean {
  return status !== "cancelled";
}

export type ServiceOrderStatusFilter =
  | "all"
  | "waiting"
  | "in_progress"
  | "ready"
  | "completed"
  | "cancelled";

export function parseServiceOrderStatusFilter(
  value: string | undefined | null,
): ServiceOrderStatusFilter {
  if (
    value === "waiting" ||
    value === "in_progress" ||
    value === "ready" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "all";
}

export function isAppointmentCheckInEligible(status: AppointmentStatus): boolean {
  return status === "scheduled" || status === "confirmed" || status === "in_progress";
}

export const ACTIVE_OPERATIONAL_STATUSES: ServiceOrderStatus[] = [
  "waiting",
  "in_progress",
  "ready",
];
