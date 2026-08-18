import type { FinancialSourceType } from "@/types/database.types";

export type FinanceAnalyticsPreset =
  | "today"
  | "last7"
  | "week"
  | "month"
  | "prev_month"
  | "last30"
  | "custom";

export type FinanceOriginKey = FinancialSourceType | "other";

export type AnalyticsEntryRow = {
  id: string;
  entryType: "income" | "expense";
  status: string;
  sourceType: FinancialSourceType;
  amountCents: number;
  category: string | null;
  description: string;
  createdAt: string;
  paidAt: string | null;
  serviceOrderId: string | null;
  saleId: string | null;
  packageId: string | null;
  detailLabel: string | null;
};

export type AnalyticsPaymentRow = {
  entryId: string;
  amountCents: number;
  paidAt: string;
};

export type AnalyticsSaleItemRow = {
  saleId: string;
  productName: string;
  totalCents: number;
  costCents: number;
};

export type FinanceBucket = {
  key: string;
  label: string;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
};

export type FinanceBreakdownItem = {
  key: string;
  label: string;
  cents: number;
  percent: number;
  entryIds: string[];
};

export type FinanceRankingItem = {
  rank: number;
  label: string;
  cents: number;
  entryIds: string[];
};

export type FinanceProfitByOrigin = {
  originKey: FinanceOriginKey;
  originLabel: string;
  revenueCents: number;
  costCents: number;
  grossProfitCents: number;
};

export type FinanceAnalytics = {
  period: { from: string; to: string; preset: FinanceAnalyticsPreset };
  hasData: boolean;
  kpis: {
    incomeReceivedCents: number;
    expensePaidCents: number;
    netResultCents: number;
    marginPercent: number | null;
  };
  cashFlow: {
    generatedCents: number;
    receivedCents: number;
    pendingCents: number;
  };
  incomeByOrigin: FinanceBreakdownItem[];
  expenseByCategory: FinanceBreakdownItem[];
  evolution: FinanceBucket[];
  topIncomeSources: FinanceRankingItem[];
  topExpenses: FinanceRankingItem[];
  profitByOrigin: FinanceProfitByOrigin[];
};

export type FinanceAnalyticsRawData = {
  entries: AnalyticsEntryRow[];
  payments: AnalyticsPaymentRow[];
  saleItems: AnalyticsSaleItemRow[];
  periodStartIso: string;
  periodEndIso: string;
};
