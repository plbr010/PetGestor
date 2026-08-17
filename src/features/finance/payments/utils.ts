import type { FinancialEntryStatus } from "@/types/database.types";

import type { EntryPaymentBalance, FinancialPaymentRecord, PaymentMethodTotals } from "./types";

export function computeEntryPaymentBalance(
  totalCents: number,
  payments: Array<Pick<FinancialPaymentRecord, "amount_cents" | "cancelled_at">>,
): EntryPaymentBalance {
  const paidCents = payments
    .filter((payment) => !payment.cancelled_at)
    .reduce((sum, payment) => sum + payment.amount_cents, 0);

  return {
    totalCents,
    paidCents,
    remainingCents: Math.max(totalCents - paidCents, 0),
  };
}

export function deriveEntryStatus(
  totalCents: number,
  paidCents: number,
): FinancialEntryStatus {
  if (paidCents <= 0) {
    return "pending";
  }

  if (paidCents >= totalCents) {
    return "paid";
  }

  return "partially_paid";
}

export function aggregatePaymentsByMethod(
  payments: Array<Pick<FinancialPaymentRecord, "amount_cents" | "payment_method" | "cancelled_at">>,
): PaymentMethodTotals {
  const totals: PaymentMethodTotals = {
    cash: 0,
    pix: 0,
    debit_card: 0,
    credit_card: 0,
    bank_transfer: 0,
    other: 0,
  };

  for (const payment of payments) {
    if (payment.cancelled_at) {
      continue;
    }

    totals[payment.payment_method] += payment.amount_cents;
  }

  return totals;
}

export function computeExpectedCashCents(
  openingBalanceCents: number,
  cashReceivedCents: number,
): number {
  return openingBalanceCents + cashReceivedCents;
}

export function computeCashDifference(
  expectedCashCents: number,
  actualCashCents: number,
): number {
  return actualCashCents - expectedCashCents;
}

export function centsToAmountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function emptyPaymentMethodTotals(): PaymentMethodTotals {
  return {
    cash: 0,
    pix: 0,
    debit_card: 0,
    credit_card: 0,
    bank_transfer: 0,
    other: 0,
  };
}

export function sumPaymentMethodTotals(totals: PaymentMethodTotals): number {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}
