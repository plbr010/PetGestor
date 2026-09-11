import { receivedCents, remainingCents } from "@/features/finance/ledger";
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
  getCivilDateRangeUtcBounds,
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

  if (code.includes("payment_exceeds_balance")) {
    return "O valor informado é maior que o saldo a receber.";
  }

  if (code.includes("invalid_payment_amount")) {
    return "Informe um valor de pagamento válido.";
  }

  if (code.includes("invalid_idempotency_key")) {
    return "Não foi possível confirmar o pagamento. Atualize a página e tente novamente.";
  }

  if (code.includes("package_price_mismatch")) {
    return "O valor financeiro do pacote está inconsistente com o preço da venda.";
  }

  if (code.includes("sale_entry_not_payable_via_finance")) {
    return "Pagamentos de venda do PDV devem ser registrados no caixa.";
  }

  if (code.includes("service_order_entry_not_reopenable")) {
    return "Receitas de atendimento não podem ser reabertas. Isso alteraria a origem automática.";
  }

  if (code.includes("package_entry_not_reopenable")) {
    return "Receitas de pacote pago não podem ser reabertas. O crédito do pacote permaneceria ativo.";
  }

  if (code.includes("sale_entry_not_reopenable") || code.includes("automatic_entry_not_reopenable")) {
    return "Lançamentos automáticos não podem ser reabertos por aqui.";
  }

  if (code.includes("financial_entry_has_payments_requires_refund")) {
    return "Há valor recebido neste lançamento. Cancelamento exige política de estorno, ainda não disponível.";
  }

  if (code.includes("package_entry_not_cancellable")) {
    return "Receitas de pacote não podem ser canceladas por aqui. Use o cancelamento do pacote.";
  }

  if (code.includes("sale_entry_not_cancellable")) {
    return "Receitas de venda do PDV não podem ser canceladas por aqui.";
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

export function getFinancialPeriodBounds(from: string, to: string, timeZone: string) {
  return getCivilDateRangeUtcBounds(from, to, timeZone);
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

    const snapshot = {
      amountCents: entry.amount_cents,
      status: entry.status,
      payments: (entry.payments ?? []).map((payment) => ({
        entryId: entry.id,
        amountCents: payment.amount_cents,
        paymentMethod: payment.payment_method,
        paidAt: payment.paid_at,
        cancelledAt: payment.cancelled_at,
      })),
    };
    const received = entry.received_cents ?? receivedCents(snapshot);
    const remaining = entry.remaining_cents ?? remainingCents(snapshot);

    if (entry.entry_type === "income") {
      incomePaidCents += received;
      incomePendingCents += remaining;
    } else {
      expensePaidCents += received;
      expensePendingCents += remaining;
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
