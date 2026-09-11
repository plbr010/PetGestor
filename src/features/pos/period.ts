import type { SalePeriodFilter } from "@/features/pos/status";
import {
  addDaysToDateString,
  getCivilDateRangeUtcBounds,
  getTodayInTimezone,
  getWeekDates,
} from "@/lib/timezone";

export type PosPeriodBounds = {
  start?: string;
  endExclusive?: string;
};

/**
 * Período operacional do PDV: intervalo half-open [start, endExclusive)
 * no fuso da empresa. Inclui 23:59:59.999 do último dia; exclui 00:00 do seguinte.
 */
export function getPosPeriodBounds(
  period: SalePeriodFilter,
  timeZone: string,
  options?: { from?: string; to?: string; today?: string },
): PosPeriodBounds {
  const today = options?.today ?? getTodayInTimezone(timeZone);

  if (period === "today") {
    return getCivilDateRangeUtcBounds(today, today, timeZone);
  }

  if (period === "week") {
    const week = getWeekDates(today);
    return getCivilDateRangeUtcBounds(week[0], week[6], timeZone);
  }

  if (period === "month") {
    const monthStart = `${today.slice(0, 7)}-01`;
    const nextMonthStart =
      addDaysToDateString(`${monthStart.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";
    const monthEnd = addDaysToDateString(nextMonthStart, -1);
    return getCivilDateRangeUtcBounds(monthStart, monthEnd, timeZone);
  }

  if (period === "custom" && options?.from && options?.to) {
    return getCivilDateRangeUtcBounds(options.from, options.to, timeZone);
  }

  return {};
}

export function isInstantInPosPeriod(
  isoUtc: string,
  bounds: PosPeriodBounds,
): boolean {
  if (!bounds.start || !bounds.endExclusive) {
    return true;
  }

  return isoUtc >= bounds.start && isoUtc < bounds.endExclusive;
}
