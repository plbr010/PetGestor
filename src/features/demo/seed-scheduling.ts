import { localDateTimeToUtcIso } from "@/lib/timezone";

import { DEMO_TIMEZONE } from "@/config/demo-seed-data";

/**
 * Retorna YYYY-MM-DD no fuso informado.
 */
export function formatDateInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Converte HH:mm para minutos desde meia-noite.
 */
export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Escolhe a data (hoje ou amanhã) para que o horário local fique no futuro.
 */
export function resolveFutureLocalDateTime(
  time: string,
  timeZone: string = DEMO_TIMEZONE,
  now: Date = new Date(),
): string {
  const today = formatDateInTimezone(now, timeZone);
  const targetIso = localDateTimeToUtcIso(today, time, timeZone);

  if (new Date(targetIso).getTime() > now.getTime()) {
    return targetIso;
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = formatDateInTimezone(tomorrow, timeZone);
  return localDateTimeToUtcIso(tomorrowDate, time, timeZone);
}

/**
 * Adiciona dias a uma data YYYY-MM-DD.
 */
export function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/**
 * Gera horário futuro com offset em horas a partir de agora.
 */
export function futureIsoFromNowHours(hoursAhead: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
}
