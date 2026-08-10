import { APPOINTMENT_STATUS_LABELS } from "@/features/appointments/status";
import { formatCentsToBRL } from "@/lib/money";
import { PET_SIZE_LABELS } from "@/features/services/utils";
import type { AppointmentStatus, PetSize } from "@/types/database.types";
import {
  addDaysToDateString,
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  getTodayInTimezone,
  getWeekDates,
} from "@/lib/timezone";

export function mapAppointmentError(message: string | undefined): string {
  const code = message ?? "";

  if (code.includes("employee_schedule_conflict")) {
    return "Este profissional já possui um agendamento nesse horário.";
  }

  if (code.includes("pet_schedule_conflict")) {
    return "Este pet já possui um agendamento nesse horário.";
  }

  if (code.includes("outside_working_hours")) {
    return "O horário está fora da jornada deste profissional.";
  }

  if (code.includes("employee_service_mismatch") || code.includes("employee_not_eligible")) {
    return "Este profissional não realiza o serviço selecionado.";
  }

  if (code.includes("service_unavailable")) {
    return "Este serviço não está disponível.";
  }

  if (code.includes("pet_unavailable") || code.includes("customer_unavailable")) {
    return "Tutor ou pet não disponível para agendamento.";
  }

  if (code.includes("appointment_in_past")) {
    return "Não é possível agendar em data ou horário passado.";
  }

  if (code.includes("invalid_pet_size")) {
    return "Selecione um porte válido para este serviço.";
  }

  if (code.includes("appointment_not_editable")) {
    return "Este agendamento não pode mais ser editado.";
  }

  return "Não foi possível concluir a operação. Verifique os dados e tente novamente.";
}

export function formatAppointmentTimeRange(
  startIso: string,
  endIso: string,
  timeZone: string,
): string {
  return `${formatUtcInTimezone(startIso, timeZone)}–${formatUtcInTimezone(endIso, timeZone)}`;
}

export function formatAppointmentDateLabel(date: string, timeZone: string): string {
  const today = getTodayInTimezone(timeZone);
  const tomorrow = addDaysToDateString(today, 1);

  if (date === today) {
    return "Hoje";
  }

  if (date === tomorrow) {
    return "Amanhã";
  }

  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: year !== new Date().getFullYear() ? "numeric" : undefined,
    timeZone,
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPriceSnapshot(cents: number): string {
  return formatCentsToBRL(cents);
}

export function formatPetSizeLabel(size: PetSize | null): string {
  if (!size) {
    return "—";
  }

  return PET_SIZE_LABELS[size];
}

export function getStatusLabel(status: AppointmentStatus): string {
  return APPOINTMENT_STATUS_LABELS[status];
}

export function parseAgendaDate(
  value: string | undefined | null,
  timeZone: string,
): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return getTodayInTimezone(timeZone);
}

export function parseAgendaView(value: string | undefined | null): "day" | "week" {
  return value === "week" ? "week" : "day";
}

export function getWeekRange(date: string): { start: string; end: string; dates: string[] } {
  const dates = getWeekDates(date);
  return {
    start: dates[0] ?? date,
    end: dates[6] ?? date,
    dates,
  };
}

export function groupAppointmentsByLocalDate<T extends { scheduled_start: string }>(
  appointments: T[],
  timeZone: string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const appointment of appointments) {
    const key = formatUtcDateInTimezone(appointment.scheduled_start, timeZone);
    const current = map.get(key) ?? [];
    current.push(appointment);
    map.set(key, current);
  }

  for (const items of map.values()) {
    items.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
    );
  }

  return map;
}

export function buildAgendaHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/dashboard/agenda?${query}` : "/dashboard/agenda";
}

export const SLOT_INTERVAL_MINUTES = 15;

export function generateTimeSlots(start: string, end: string, intervalMinutes = 15): string[] {
  const slots: string[] = [];
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  let minutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (minutes < endMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += intervalMinutes;
  }

  return slots;
}
