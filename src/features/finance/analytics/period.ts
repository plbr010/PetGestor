import type { FinanceAnalyticsPreset } from "@/features/finance/analytics/types";
import { getMonthRange } from "@/features/finance/utils";
import {
  addDaysToDateString,
  getTodayInTimezone,
  getWeekDates,
} from "@/lib/timezone";

export function resolveFinanceAnalyticsPeriod(
  params: {
    from?: string | null;
    to?: string | null;
    preset?: string | null;
  },
  timeZone: string,
): { from: string; to: string; preset: FinanceAnalyticsPreset } {
  const today = getTodayInTimezone(timeZone);

  if (params.preset === "today") {
    return { from: today, to: today, preset: "today" };
  }

  if (params.preset === "last7") {
    return {
      from: addDaysToDateString(today, -6),
      to: today,
      preset: "last7",
    };
  }

  if (params.preset === "week") {
    const weekDates = getWeekDates(today);
    return {
      from: weekDates[0] ?? today,
      to: weekDates[6] ?? today,
      preset: "week",
    };
  }

  if (params.preset === "last30") {
    return {
      from: addDaysToDateString(today, -29),
      to: today,
      preset: "last30",
    };
  }

  if (params.preset === "prev_month") {
    const prevAnchor = addDaysToDateString(`${today.slice(0, 7)}-01`, -1);
    const range = getMonthRange(prevAnchor);
    return { from: range.from, to: range.to, preset: "prev_month" };
  }

  if (
    params.from &&
    params.to &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.to)
  ) {
    return { from: params.from, to: params.to, preset: "custom" };
  }

  const month = getMonthRange(today);
  return { from: month.from, to: month.to, preset: "month" };
}

export function periodDayCount(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00Z`).getTime();
  const end = new Date(`${to}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function chooseEvolutionGranularity(dayCount: number): "day" | "week" | "month" {
  if (dayCount <= 31) {
    return "day";
  }

  if (dayCount <= 120) {
    return "week";
  }

  return "month";
}

export function bucketKeyForDate(
  date: string,
  granularity: "day" | "week" | "month",
): string {
  if (granularity === "day") {
    return date;
  }

  if (granularity === "month") {
    return date.slice(0, 7);
  }

  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value.toISOString().slice(0, 10);
}

export function bucketLabel(key: string, granularity: "day" | "week" | "month"): string {
  if (granularity === "month") {
    const [year, month] = key.split("-");
    return `${month}/${year}`;
  }

  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}
