import {
  FINANCIAL_ENTRY_STATUS_LABELS,
  FINANCIAL_ENTRY_TYPE_LABELS,
  FINANCIAL_SOURCE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/features/finance/status";
import type { FinancialEntryListItem, FinancialSummary } from "@/features/finance/types";
import { formatCentsToBRL, parseBRLToCents } from "@/lib/money";
import {
  addDaysToDateString,
  getTodayInTimezone,
  getWeekDates,
  localDateTimeToUtcIso,
  resolveCompanyTimeZone,
} from "@/lib/timezone";
import type {
  FinancialEntryStatus,
  FinancialEntryType,
  PaymentMethod,
} from "@/types/database.types";

export const MAX_FINANCE_AMOUNT_CENTS = 99_999_999;

export function parseAmountToCents(input: string): number | null {
  const cents = parseBRLToCents(input);
  if (cents === null || cents <= 0 || cents > MAX_FINANCE_AMOUNT_CENTS) {
    return null;
  }

  return cents;
}

export function formatAmountCents(cents: number): string {
  return formatCentsToBRL(cents);
}

export function mapFinanceError(message: string | undefined): string {
  const code = message ?? "";

  if (code.includes("invalid_payment_method")) {
    return "Selecione uma forma de pagamento válida.";
  }

  if (code.includes("invalid_status_transition")) {
    return "Esta alteração não é permitida no status atual.";
  }

  if (code.includes("service_order_entry_not_cancellable")) {
    return "Receitas geradas por atendimento não podem ser canceladas manualmente.";
  }

  if (code.includes("financial_entry_not_found")) {
    return "Não foi possível encontrar o lançamento solicitado.";
  }

  return "Não foi possível concluir a operação. Verifique os dados e tente novamente.";
}

export function getTypeLabel(type: FinancialEntryType): string {
  return FINANCIAL_ENTRY_TYPE_LABELS[type];
}

export function getStatusLabel(status: FinancialEntryStatus): string {
  return FINANCIAL_ENTRY_STATUS_LABELS[status];
}

export function getSourceLabel(sourceType: string): string {
  return FINANCIAL_SOURCE_TYPE_LABELS[sourceType as keyof typeof FINANCIAL_SOURCE_TYPE_LABELS] ?? sourceType;
}

export function getPaymentMethodLabel(method: PaymentMethod | null): string {
  if (!method) {
    return "—";
  }

  return PAYMENT_METHOD_LABELS[method];
}

export function buildFinanceHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/dashboard/financeiro?${query}` : "/dashboard/financeiro";
}

export function getMonthRange(date: string): { from: string; to: string } {
  const [year, month] = date.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = addDaysToDateString(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, -1);
  return { from, to };
}

export function resolveFinancialPeriod(
  params: {
    from?: string | null;
    to?: string | null;
    preset?: string | null;
  },
  timeZone: string,
): { from: string; to: string; preset: "today" | "week" | "month" | "custom" } {
  const today = getTodayInTimezone(timeZone);

  if (params.preset === "today") {
    return { from: today, to: today, preset: "today" };
  }

  if (params.preset === "week") {
    const weekDates = getWeekDates(today);
    return {
      from: weekDates[0] ?? today,
      to: weekDates[6] ?? today,
      preset: "week",
    };
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

export function computeFinancialSummary(entries: FinancialEntryListItem[]): FinancialSummary {
  let incomePaidCents = 0;
  let incomePendingCents = 0;
  let expensePaidCents = 0;
  let expensePendingCents = 0;

  for (const entry of entries) {
    if (entry.status === "cancelled") {
      continue;
    }

    if (entry.entry_type === "income") {
      if (entry.status === "paid") {
        incomePaidCents += entry.amount_cents;
      } else {
        incomePendingCents += entry.amount_cents;
      }
    } else if (entry.status === "paid") {
      expensePaidCents += entry.amount_cents;
    } else {
      expensePendingCents += entry.amount_cents;
    }
  }

  const realizedResultCents = incomePaidCents - expensePaidCents;
  const projectedResultCents =
    incomePaidCents +
    incomePendingCents -
    (expensePaidCents + expensePendingCents);

  return {
    incomePaidCents,
    incomePendingCents,
    expensePaidCents,
    expensePendingCents,
    realizedResultCents,
    projectedResultCents,
  };
}

export function formatDisplayDate(date: string | null): string {
  if (!date) {
    return "—";
  }

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function formatPaidAt(iso: string | null, timeZone: string): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: resolveCompanyTimeZone(timeZone),
    }).format(date);
  } catch {
    return "—";
  }
}

export function localDateTimeToUtcIsoFromInput(
  localDateTime: string,
  timeZone: string,
): string {
  const [date, time] = localDateTime.split("T");
  return localDateTimeToUtcIso(date, time, timeZone);
}
