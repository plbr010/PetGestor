import {
  addDaysToDateString,
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  localDateTimeToUtcIso,
} from "@/lib/timezone";

export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "custom_days",
] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_MAX_OCCURRENCES = 52;

export type RecurrenceEndMode = "count" | "date";

export type ExpandRecurrenceInput = {
  startUtcIso: string;
  timeZone: string;
  frequency: RecurrenceFrequency;
  /** Para custom_days: intervalo em dias. Para as demais, normalmente 1. */
  intervalValue: number;
  maxOccurrences: number | null;
  endsAtLocalDate: string | null;
};

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Soma meses a YYYY-MM-DD, clampando o dia ao último dia do mês alvo. */
export function addMonthsToDateString(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonthIndex = totalMonths % 12;
  const clampedDay = Math.min(day, daysInMonth(nextYear, nextMonthIndex));
  const mm = String(nextMonthIndex + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${nextYear}-${mm}-${dd}`;
}

export function stepRecurrenceLocalDate(
  localDate: string,
  frequency: RecurrenceFrequency,
  intervalValue: number,
): string {
  switch (frequency) {
    case "weekly":
      return addDaysToDateString(localDate, 7 * intervalValue);
    case "biweekly":
      return addDaysToDateString(localDate, 14 * intervalValue);
    case "monthly":
      return addMonthsToDateString(localDate, intervalValue);
    case "custom_days":
      return addDaysToDateString(localDate, intervalValue);
    default:
      return addDaysToDateString(localDate, 7);
  }
}

/**
 * Expande ocorrências (incluindo a primeira) em ISO UTC.
 * Limite hard: RECURRENCE_MAX_OCCURRENCES.
 */
export function expandRecurrenceStarts(input: ExpandRecurrenceInput): string[] {
  const {
    startUtcIso,
    timeZone,
    frequency,
    intervalValue,
    maxOccurrences,
    endsAtLocalDate,
  } = input;

  if (intervalValue < 1) {
    return [startUtcIso];
  }

  const localTime = formatUtcInTimezone(startUtcIso, timeZone);
  let localDate = formatUtcDateInTimezone(startUtcIso, timeZone);
  const starts: string[] = [];

  const hardCap = RECURRENCE_MAX_OCCURRENCES;
  const countCap =
    maxOccurrences != null
      ? Math.min(Math.max(maxOccurrences, 1), hardCap)
      : hardCap;

  while (starts.length < countCap) {
    if (endsAtLocalDate && localDate > endsAtLocalDate) {
      break;
    }

    starts.push(localDateTimeToUtcIso(localDate, localTime, timeZone));
    localDate = stepRecurrenceLocalDate(localDate, frequency, intervalValue);
  }

  return starts;
}

export function formatRecurrenceSkipSummary(
  createdCount: number,
  skippedCount: number,
): string {
  if (skippedCount <= 0) {
    return `${createdCount} agendamento${createdCount === 1 ? "" : "s"} criado${createdCount === 1 ? "" : "s"} com sucesso.`;
  }

  return `${createdCount} de ${createdCount + skippedCount} agendamentos foram criados. ${skippedCount} não puderam ser criados por conflito ou indisponibilidade.`;
}
