import type {
  CancelledSlotForWaitlist,
  WaitlistMatchCandidate,
  WaitlistPeriod,
} from "@/features/appointments/waitlist/types";
import { formatUtcDateInTimezone, formatUtcInTimezone } from "@/lib/timezone";

export const WAITLIST_PERIOD_LABELS: Record<WaitlistPeriod, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
  any: "Qualquer horário",
};

export function hourToWaitlistPeriod(hour: number): WaitlistPeriod {
  if (hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function normalizeTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, 5);
}

function localTimesOverlap(
  slotStart: string,
  slotEnd: string,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return slotStart < rangeEnd && slotEnd > rangeStart;
}

export function matchesCancelledSlot(
  entry: WaitlistMatchCandidate,
  slot: CancelledSlotForWaitlist,
  timeZone: string,
): boolean {
  if (entry.status !== "waiting" && entry.status !== "contacted") {
    return false;
  }

  if (entry.service_id !== slot.service_id) {
    return false;
  }

  if (
    entry.preferred_employee_id &&
    entry.preferred_employee_id !== slot.employee_id
  ) {
    return false;
  }

  const slotDate = formatUtcDateInTimezone(slot.scheduled_start, timeZone);

  if (entry.preferred_date && entry.preferred_date !== slotDate) {
    return false;
  }

  const slotStartTime = formatUtcInTimezone(slot.scheduled_start, timeZone);
  const slotEndTime = formatUtcInTimezone(slot.scheduled_end, timeZone);

  if (entry.preferred_period && entry.preferred_period !== "any") {
    const slotHour = Number.parseInt(slotStartTime.split(":")[0] ?? "0", 10);
    if (entry.preferred_period !== hourToWaitlistPeriod(slotHour)) {
      return false;
    }
  }

  const preferredStart = normalizeTime(entry.preferred_time_start);
  const preferredEnd = normalizeTime(entry.preferred_time_end);

  if (preferredStart && preferredEnd) {
    if (!localTimesOverlap(slotStartTime, slotEndTime, preferredStart, preferredEnd)) {
      return false;
    }
  }

  return true;
}

export function countMatchingWaitlistEntries(
  entries: WaitlistMatchCandidate[],
  slot: CancelledSlotForWaitlist,
  timeZone: string,
): number {
  return entries.filter((entry) => matchesCancelledSlot(entry, slot, timeZone)).length;
}

export function formatWaitlistPreference(
  entry: Pick<
    WaitlistMatchCandidate,
    "preferred_date" | "preferred_period" | "preferred_time_start" | "preferred_time_end"
  >,
): string {
  const parts: string[] = [];

  if (entry.preferred_date) {
    parts.push(entry.preferred_date.split("-").reverse().join("/"));
  }

  if (entry.preferred_period) {
    parts.push(WAITLIST_PERIOD_LABELS[entry.preferred_period]);
  }

  const start = normalizeTime(entry.preferred_time_start);
  const end = normalizeTime(entry.preferred_time_end);

  if (start && end) {
    parts.push(`${start}–${end}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Sem preferência específica";
}

export function formatWaitingDuration(createdAt: string, nowIso = new Date().toISOString()): string {
  const diffMs = new Date(nowIso).getTime() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / 3_600_000);

  if (hours < 1) {
    return "Há poucos minutos";
  }

  if (hours < 24) {
    return `Há ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? "Há 1 dia" : `Há ${days} dias`;
}

export function buildDuplicatePrefill(input: {
  customerId: string;
  petId: string;
  serviceId: string;
  employeeId: string;
  petSize: string | null;
  notes: string | null;
}): Omit<import("@/features/appointments/waitlist/types").AppointmentQuickPrefill, "date" | "time"> {
  return {
    customerId: input.customerId,
    petId: input.petId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    petSize: input.petSize,
    notes: input.notes,
  };
}

export function buildSlotPrefill(date: string, time: string, employeeId?: string) {
  return {
    date,
    time,
    employeeId,
  };
}

export function slotTimeFromClick(hour: number, quarterIndex: number): string {
  const minutes = quarterIndex * 15;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isRangeBlockedByTimeBlocks(
  slotStartMs: number,
  slotEndMs: number,
  blocks: Array<{ block_start: string; block_end: string; employee_id: string | null }>,
  employeeId?: string,
): boolean {
  return blocks.some((block) => {
    if (block.employee_id && employeeId && block.employee_id !== employeeId) {
      return false;
    }

    const blockStart = new Date(block.block_start).getTime();
    const blockEnd = new Date(block.block_end).getTime();

    return slotStartMs < blockEnd && slotEndMs > blockStart;
  });
}
