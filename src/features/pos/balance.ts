import type { PaymentMethod } from "@/types/database.types";

/** Saldo pendente nunca negativo. */
export function computeSaleBalanceCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}

export function canReceiveSalePayment(input: {
  status: string;
  cancelledAt: string | null;
  totalCents: number;
  paidCents: number;
}): boolean {
  if (input.cancelledAt) {
    return false;
  }

  if (input.status !== "partially_paid") {
    return false;
  }

  return computeSaleBalanceCents(input.totalCents, input.paidCents) > 0;
}

export type CashMethodTotals = Record<PaymentMethod, number>;

export function emptyCashMethodTotals(): CashMethodTotals {
  return {
    cash: 0,
    pix: 0,
    debit_card: 0,
    credit_card: 0,
    bank_transfer: 0,
    other: 0,
  };
}

export function sumCashMethodTotals(totals: CashMethodTotals): number {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

/** Dinheiro físico esperado = abertura + entradas cash do período. */
export function computeExpectedCashCents(
  openingBalanceCents: number,
  cashReceivedCents: number,
): number {
  return Math.max(0, openingBalanceCents) + Math.max(0, cashReceivedCents);
}

export function computeCashDifferenceCents(
  countedCashCents: number,
  expectedCashCents: number,
): number {
  return countedCashCents - expectedCashCents;
}
