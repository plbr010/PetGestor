import { resolveFinanceAnalyticsPeriod } from "@/features/finance/analytics/period";
import {
  addDaysToDateString,
  getCivilDateRangeUtcBounds,
  getTodayInTimezone,
  resolveCompanyTimeZone,
} from "@/lib/timezone";

export type ReportPreset = "today" | "last7" | "month" | "prev_month" | "last30" | "year" | "custom";

export function resolveReportPeriod(
  params: { from?: string | null; to?: string | null; preset?: string | null },
  timeZone: string,
): { from: string; to: string; preset: ReportPreset } {
  const safeTimeZone = resolveCompanyTimeZone(timeZone);

  if (params.preset === "year") {
    const today = getTodayInTimezone(safeTimeZone);
    const year = today.slice(0, 4);
    return { from: `${year}-01-01`, to: today, preset: "year" };
  }

  const result = resolveFinanceAnalyticsPeriod(params, safeTimeZone);
  return { from: result.from, to: result.to, preset: result.preset as ReportPreset };
}

export function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const startMs = new Date(`${from}T12:00:00Z`).getTime();
  const endMs = new Date(`${to}T12:00:00Z`).getTime();
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;

  return {
    from: addDaysToDateString(from, -days),
    to: addDaysToDateString(from, -1),
  };
}

/**
 * Período analítico canônico: half-open [from 00:00, dayAfter(to) 00:00)
 * no fuso da empresa. Reutiliza getCivilDateRangeUtcBounds — não duplicar a regra.
 */
export function getReportPeriodBounds(
  from: string,
  to: string,
  timeZone: string,
): { start: string; endExclusive: string } {
  return getCivilDateRangeUtcBounds(from, to, resolveCompanyTimeZone(timeZone));
}

export function eachCivilDateInclusive(from: string, to: string): string[] {
  if (from > to) {
    return [];
  }

  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addDaysToDateString(current, 1);
  }
  return dates;
}

/** Weekday 0=domingo … 6=sábado da data civil (calendário, independente de fuso). */
export function weekdayOfCivilDate(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

export function countWeekdaysInCivilRange(from: string, to: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const date of eachCivilDateInclusive(from, to)) {
    counts[weekdayOfCivilDate(date)] += 1;
  }
  return counts;
}

export function periodLabel(preset: ReportPreset): string {
  const labels: Record<ReportPreset, string> = {
    today: "Hoje",
    last7: "Últimos 7 dias",
    month: "Mês atual",
    prev_month: "Mês anterior",
    last30: "Últimos 30 dias",
    year: "Ano atual",
    custom: "Personalizado",
  };
  return labels[preset];
}
