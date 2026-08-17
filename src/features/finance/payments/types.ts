import type { PaymentMethod } from "@/types/database.types";

export type FinancialPaymentRecord = {
  id: string;
  financial_entry_id: string;
  amount_cents: number;
  payment_method: PaymentMethod;
  paid_at: string;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
};

export type EntryPaymentBalance = {
  totalCents: number;
  paidCents: number;
  remainingCents: number;
};

export type PaymentMethodTotals = Record<PaymentMethod, number>;

export type DailyCashSummary = {
  totalReceivedCents: number;
  byMethod: PaymentMethodTotals;
  expensePaidCents: number;
  netBalanceCents: number;
  expectedCashCents: number;
};

export type CashClosingRecord = {
  id: string;
  business_date: string;
  closed_at: string | null;
  opening_balance_cents: number;
  expected_cash_cents: number | null;
  actual_cash_cents: number | null;
  difference_cents: number | null;
  total_received_cents: number;
  cash_received_cents: number;
  pix_received_cents: number;
  debit_received_cents: number;
  credit_received_cents: number;
  transfer_received_cents: number;
  other_received_cents: number;
  expense_paid_cents: number;
  net_balance_cents: number;
  notes: string | null;
  reopened_at: string | null;
};
