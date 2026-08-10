import type { AppointmentStatus } from "@/types/database.types";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const ACTIVE_BLOCKING_STATUSES: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
];

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["cancelled", "no_show"],
  in_progress: [],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionStatus(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditableStatus(status: AppointmentStatus): boolean {
  return status === "scheduled" || status === "confirmed";
}

export type AppointmentStatusFilter =
  | "all"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "no_show";

export function parseAppointmentStatusFilter(
  value: string | undefined | null,
): AppointmentStatusFilter {
  if (
    value === "scheduled" ||
    value === "confirmed" ||
    value === "cancelled" ||
    value === "no_show"
  ) {
    return value;
  }

  return "all";
}
