import { resolveFinanceAnalyticsPeriod } from "@/features/finance/analytics/period";
import {
  addDaysToDateString,
  DEFAULT_TIMEZONE,
  getTodayInTimezone,
  isValidTimezone,
} from "@/lib/timezone";

export type ReportPreset = "today" | "last7" | "month" | "prev_month" | "last30" | "year" | "custom";

export function resolveReportPeriod(
  params: { from?: string | null; to?: string | null; preset?: string | null },
  timeZone: string,
): { from: string; to: string; preset: ReportPreset } {
  const safeTimeZone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;

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
