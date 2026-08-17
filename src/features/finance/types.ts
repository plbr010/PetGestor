import type {
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSourceType,
  PaymentMethod,
} from "@/types/database.types";

export type FinancialEntryListItem = {
  id: string;
  entry_type: FinancialEntryType;
  status: FinancialEntryStatus;
  source_type: FinancialSourceType;
  service_order_id: string | null;
  description: string;
  category: string | null;
  amount_cents: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  paid_cents?: number;
  service_order?: {
    id: string;
    appointment: {
      pet: { name: string };
      customer: { name: string };
    };
  } | null;
};

export type FinancialEntryDetail = FinancialEntryListItem;

export type FinancialSummary = {
  incomeGeneratedCents: number;
  incomeReceivedCents: number;
  incomePaidCents: number;
  incomePendingCents: number;
  expensePaidCents: number;
  expensePendingCents: number;
  realizedResultCents: number;
  projectedResultCents: number;
};

export type FinancialPeriodPreset = "today" | "week" | "month" | "custom";

export type FinancialPeriod = {
  from: string;
  to: string;
  preset: FinancialPeriodPreset;
};
