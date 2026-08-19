/**
 * Conversão de horário local da empresa ↔ UTC (TIMESTAMPTZ).
 * Usa Intl — sem dependências extras.
 */

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Normaliza fuso da empresa — evita RangeError quando o valor salvo é inválido. */
export function resolveCompanyTimeZone(timeZone: string | null | undefined): string {
  const trimmed = timeZone?.trim();
  if (trimmed && isValidTimezone(trimmed)) {
    return trimmed;
  }
  return DEFAULT_TIMEZONE;
}

function getZonedParts(date: Date, timeZone: string) {
  const safeTimeZone = resolveCompanyTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
  };
}

/**
 * Converte data (YYYY-MM-DD) + hora (HH:mm) no fuso da empresa para ISO UTC.
 */
export function localDateTimeToUtcIso(
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const zonedKey = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    const targetKey = `${date}T${time}`;

    if (zonedKey === targetKey) {
      return new Date(guess).toISOString();
    }

    const zonedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    guess += targetAsUtc - zonedAsUtc;
  }

  return new Date(guess).toISOString();
}

/**
 * Formata instante UTC como hora local da empresa (HH:mm).
 */
export function formatUtcInTimezone(
  isoUtc: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = new Date(isoUtc);
  const parts = getZonedParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

/**
 * Formata instante UTC como data local (YYYY-MM-DD).
 */
export function formatUtcDateInTimezone(
  isoUtc: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = new Date(isoUtc);
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Retorna weekday 0=domingo … 6=sábado no fuso da empresa.
 */
export function getWeekdayInTimezone(
  isoUtc: string,
  timeZone: string = DEFAULT_TIMEZONE,
): number {
  const safeTimeZone = resolveCompanyTimeZone(timeZone);
  const date = new Date(isoUtc);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone,
    weekday: "short",
  }).format(date);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? 0;
}

export function getTodayInTimezone(timeZone: string = DEFAULT_TIMEZONE): string {
  return formatUtcDateInTimezone(new Date().toISOString(), timeZone);
}

export function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

export function getWeekDates(date: string): string[] {
  const [year, month, day] = date.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const weekday = anchor.getUTCDay();
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - weekday);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

export function isPastLocalDateTime(
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const iso = localDateTimeToUtcIso(date, time, timeZone);
  return new Date(iso).getTime() < Date.now();
}

export function isPastLocalDate(date: string, timeZone: string = DEFAULT_TIMEZONE): boolean {
  const today = getTodayInTimezone(timeZone);
  return date < today;
}
