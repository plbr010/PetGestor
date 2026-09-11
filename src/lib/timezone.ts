/**
 * Conversão de horário local da empresa ↔ UTC (TIMESTAMPTZ).
 *
 * Fonte de verdade operacional: timezone da empresa (`companies.timezone`).
 * Datas civis (YYYY-MM-DD) nunca são interpretadas como instante UTC.
 * Usa Intl — sem dependências extras.
 */

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CIVIL_DATE_INVALID_MESSAGE = "Informe uma data válida.";

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

export type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

/**
 * Valida calendário real. Rejeita 2026-02-31, 2026-04-31, 2026-13-01, etc.
 * Não usa Date.UTC para “corrigir” o dia — compara ida e volta.
 */
export function isValidCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const utc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utc);

  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

export function parseCivilDate(value: string): CivilDateParts | null {
  if (!isValidCivilDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function formatCivilDate(parts: CivilDateParts): string {
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formata YYYY-MM-DD como rótulo de calendário, sem deslocar o dia.
 * Sempre usa UTC no Date civil — nunca o timezone da empresa/navegador.
 */
export function formatCivilDateLabel(
  date: string,
  options?: {
    locale?: string;
    weekday?: "long" | "short" | "narrow" | "none";
    includeYear?: boolean;
  },
): string {
  const parsed = parseCivilDate(date);
  if (!parsed) {
    return date;
  }

  const weekday = options?.weekday ?? "long";

  return new Intl.DateTimeFormat(options?.locale ?? "pt-BR", {
    weekday: weekday === "none" ? undefined : weekday,
    day: "numeric",
    month: "long",
    year: options?.includeYear === false ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

/** Data civil como dd/mm/aaaa, sem deslocar o dia. */
export function formatCivilDateNumeric(
  date: string,
  locale = "pt-BR",
): string {
  const parsed = parseCivilDate(date);
  if (!parsed) {
    return date;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

export function civilDateWeekday(date: string): number {
  const parsed = parseCivilDate(date);
  if (!parsed) {
    return 0;
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

export function diffCivilDays(from: string, to: string): number {
  const start = parseCivilDate(from);
  const end = parseCivilDate(to);
  if (!start || !end) {
    return 0;
  }

  const ms =
    Date.UTC(end.year, end.month - 1, end.day) -
    Date.UTC(start.year, start.month - 1, start.day);
  return ms / 86_400_000;
}

function getZonedParts(date: Date, timeZone: string) {
  if (Number.isNaN(date.getTime())) {
    const today = new Date();
    return {
      year: String(today.getUTCFullYear()),
      month: String(today.getUTCMonth() + 1).padStart(2, "0"),
      day: String(today.getUTCDate()).padStart(2, "0"),
      hour: "00",
      minute: "00",
    };
  }

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
 * Converte data civil (YYYY-MM-DD) + hora local (HH:mm) no fuso da empresa para ISO UTC.
 * Uma única conversão: civil + hora + timezone → timestamptz.
 */
export function localDateTimeToUtcIso(
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const parsed = parseCivilDate(date);
  if (!parsed) {
    throw new Error("invalid_civil_date");
  }

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    throw new Error("invalid_local_time");
  }

  const [hour, minute] = time.split(":").map(Number);
  const { year, month, day } = parsed;

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

  throw new Error("invalid_local_time");
}

/** Alias explícito da conversão civil+hora+timezone → UTC. */
export const localDateTimeToUtc = localDateTimeToUtcIso;

export function tryLocalDateTimeToUtcIso(
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string | null {
  try {
    return localDateTimeToUtcIso(date, time, timeZone);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "invalid_civil_date" || error.message === "invalid_local_time")
    ) {
      return null;
    }
    throw error;
  }
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
 * Formata instante UTC como data civil local (YYYY-MM-DD) no fuso da empresa.
 */
export function formatUtcDateInTimezone(
  isoUtc: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = new Date(isoUtc);
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function utcToCompanyLocal(
  isoUtc: string,
  timeZone: string = DEFAULT_TIMEZONE,
): { date: string; time: string } {
  return {
    date: formatUtcDateInTimezone(isoUtc, timeZone),
    time: formatUtcInTimezone(isoUtc, timeZone),
  };
}

/**
 * Limites UTC do dia civil da empresa: [início, próximo dia).
 */
export function getCivilDayUtcBounds(
  date: string,
  timeZone: string = DEFAULT_TIMEZONE,
): { start: string; end: string } {
  const start = localDateTimeToUtcIso(date, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(date, 1), "00:00", timeZone);
  return { start, end };
}

/**
 * Intervalo half-open [from 00:00, dayAfter(to) 00:00) no fuso da empresa.
 * Inclui 23:59:59.999 do último dia; exclui 00:00 do dia seguinte.
 */
export function getCivilDateRangeUtcBounds(
  from: string,
  to: string,
  timeZone: string = DEFAULT_TIMEZONE,
): { start: string; endExclusive: string } {
  const start = localDateTimeToUtcIso(from, "00:00", timeZone);
  const endExclusive = localDateTimeToUtcIso(addDaysToDateString(to, 1), "00:00", timeZone);
  return { start, endExclusive };
}

export function isInstantInCivilDateRange(
  isoUtc: string,
  from: string,
  to: string,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const { start, endExclusive } = getCivilDateRangeUtcBounds(from, to, timeZone);
  return isoUtc >= start && isoUtc < endExclusive;
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
  const parsed = parseCivilDate(date);
  if (!parsed) {
    throw new Error("invalid_civil_date");
  }

  const result = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatCivilDate({
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  });
}

export function getWeekDates(date: string): string[] {
  const parsed = parseCivilDate(date);
  if (!parsed) {
    throw new Error("invalid_civil_date");
  }

  const anchor = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const weekday = anchor.getUTCDay();
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - weekday);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    return formatCivilDate({
      year: current.getUTCFullYear(),
      month: current.getUTCMonth() + 1,
      day: current.getUTCDate(),
    });
  });
}

export function isPastLocalDateTime(
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  if (!isValidCivilDate(date) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return true;
  }

  const iso = tryLocalDateTimeToUtcIso(date, time, timeZone);
  if (!iso) {
    return true;
  }

  return new Date(iso).getTime() < Date.now();
}

export function isPastLocalDate(date: string, timeZone: string = DEFAULT_TIMEZONE): boolean {
  if (!isValidCivilDate(date)) {
    return true;
  }

  const today = getTodayInTimezone(timeZone);
  return date < today;
}
