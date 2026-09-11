import type { FinancialEntryStatus, FinancialSourceType, PaymentMethod } from "@/types/database.types";

export const PAYMENT_METHODS = [
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
] as const satisfies readonly PaymentMethod[];

export type ActiveFinancialPayment = {
  id?: string;
  entryId: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  cancelledAt?: string | null;
  companyId?: string;
  idempotencyKey?: string | null;
};

export type FinancialLedgerSnapshot = {
  amountCents: number;
  status: FinancialEntryStatus;
  payments: ActiveFinancialPayment[];
};

export function isActiveFinancialPayment(payment: {
  cancelledAt?: string | null;
}): boolean {
  return payment.cancelledAt == null;
}

export function sumActivePayments(
  payments: Array<{ amountCents: number; cancelledAt?: string | null }>,
): number {
  return payments.reduce((sum, payment) => {
    if (!isActiveFinancialPayment(payment)) {
      return sum;
    }

    return sum + payment.amountCents;
  }, 0);
}

/**
 * Valor efetivamente recebido.
 * Pagamentos ativos são a fonte de verdade.
 * Legado: status paid sem nenhuma parcela conta o amount integral (não inventa linha).
 */
export function receivedCents(snapshot: FinancialLedgerSnapshot): number {
  if (snapshot.status === "cancelled") {
    return 0;
  }

  const fromPayments = sumActivePayments(snapshot.payments);
  if (fromPayments > 0) {
    return fromPayments;
  }

  if (snapshot.status === "paid") {
    return snapshot.amountCents;
  }

  return 0;
}

export function remainingCents(snapshot: FinancialLedgerSnapshot): number {
  if (snapshot.status === "cancelled") {
    return 0;
  }

  return Math.max(0, snapshot.amountCents - receivedCents(snapshot));
}

export function deriveFinancialStatus(input: {
  amountCents: number;
  receivedCents: number;
  cancelled?: boolean;
}): FinancialEntryStatus {
  if (input.cancelled) {
    return "cancelled";
  }

  if (input.receivedCents <= 0) {
    return "pending";
  }

  if (input.receivedCents < input.amountCents) {
    return "partially_paid";
  }

  return "paid";
}

export function wouldOverpay(snapshot: FinancialLedgerSnapshot, amountCents: number): boolean {
  return amountCents > remainingCents(snapshot);
}

export function entryMatchesPaymentMethodFilter(
  entry: { id: string; paymentMethod: PaymentMethod | null },
  payments: ActiveFinancialPayment[],
  method: PaymentMethod,
): boolean {
  const active = payments.filter(
    (payment) => payment.entryId === entry.id && isActiveFinancialPayment(payment),
  );

  if (active.some((payment) => payment.paymentMethod === method)) {
    return true;
  }

  return active.length === 0 && entry.paymentMethod === method;
}

export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }

    seen.add(row.id);
    result.push(row);
  }

  return result;
}

export type ReopenDecision =
  | { allowed: true; reason: "manual_reopen_cancels_payments" }
  | { allowed: false; error: string };

export type CancelDecision =
  | { allowed: true; reason: "manual_pending" }
  | { allowed: false; error: string };

export function classifyReopen(
  sourceType: FinancialSourceType,
  status: FinancialEntryStatus,
): ReopenDecision {
  if (status !== "paid" && status !== "partially_paid") {
    return { allowed: false, error: "invalid_status_transition" };
  }

  if (sourceType === "manual") {
    return { allowed: true, reason: "manual_reopen_cancels_payments" };
  }

  if (sourceType === "service_order") {
    return { allowed: false, error: "service_order_entry_not_reopenable" };
  }

  if (sourceType === "service_package") {
    return { allowed: false, error: "package_entry_not_reopenable" };
  }

  return { allowed: false, error: "sale_entry_not_reopenable" };
}

export function classifyCancel(
  sourceType: FinancialSourceType,
  status: FinancialEntryStatus,
  received: number,
): CancelDecision {
  if (sourceType === "service_order") {
    return { allowed: false, error: "service_order_entry_not_cancellable" };
  }

  if (sourceType === "service_package") {
    return { allowed: false, error: "package_entry_not_cancellable" };
  }

  if (sourceType === "sale") {
    return { allowed: false, error: "sale_entry_not_cancellable" };
  }

  if (status === "cancelled") {
    return { allowed: false, error: "invalid_status_transition" };
  }

  if (status !== "pending" || received > 0) {
    return { allowed: false, error: "financial_entry_has_payments_requires_refund" };
  }

  return { allowed: true, reason: "manual_pending" };
}

export function isPayableViaFinance(sourceType: FinancialSourceType): boolean {
  return sourceType !== "sale";
}

export function paymentMethodsLabel(
  methods: Array<PaymentMethod | null | undefined>,
  labels: Record<PaymentMethod, string>,
): string {
  const unique = [...new Set(methods.filter((method): method is PaymentMethod => Boolean(method)))];

  if (unique.length === 0) {
    return "—";
  }

  return unique.map((method) => labels[method]).join(" + ");
}
