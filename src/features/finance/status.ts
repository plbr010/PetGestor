import type {
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSourceType,
  PaymentMethod,
} from "@/types/database.types";

export const FINANCIAL_ENTRY_TYPE_LABELS: Record<FinancialEntryType, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const FINANCIAL_ENTRY_STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  pending: "Pendente",
  partially_paid: "Parcialmente pago",
  paid: "Pago",
  cancelled: "Cancelado",
};

export const FINANCIAL_SOURCE_TYPE_LABELS: Record<FinancialSourceType, string> = {
  service_order: "Atendimento",
  manual: "Manual",
  service_package: "Pacote",
  sale: "Venda PDV",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  bank_transfer: "Transferência",
  other: "Outro",
};

export const INCOME_CATEGORY_SUGGESTIONS = ["Serviços", "Venda avulsa", "Outros"] as const;
export const EXPENSE_CATEGORY_SUGGESTIONS = [
  "Produtos",
  "Aluguel",
  "Energia",
  "Água",
  "Marketing",
  "Equipamentos",
  "Manutenção",
  "Outros",
] as const;

const ALLOWED_TRANSITIONS: Record<FinancialEntryStatus, FinancialEntryStatus[]> = {
  pending: ["paid", "partially_paid", "cancelled"],
  partially_paid: ["paid", "cancelled"],
  paid: ["pending"],
  cancelled: [],
};

export function canTransitionFinancialStatus(
  from: FinancialEntryStatus,
  to: FinancialEntryStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isManualEntryEditable(sourceType: FinancialSourceType): boolean {
  return sourceType === "manual";
}

export function isServiceOrderEntryCancellable(): boolean {
  return false;
}

export type FinancialEntryTypeFilter = "all" | "income" | "expense";
export type FinancialEntryStatusFilter = "all" | "pending" | "partially_paid" | "paid" | "cancelled";
export type PaymentMethodFilter =
  | "all"
  | "cash"
  | "pix"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "other";

export function parseFinancialEntryTypeFilter(
  value: string | undefined | null,
): FinancialEntryTypeFilter {
  if (value === "income" || value === "expense") {
    return value;
  }

  return "all";
}

export function parseFinancialEntryStatusFilter(
  value: string | undefined | null,
): FinancialEntryStatusFilter {
  if (value === "pending" || value === "partially_paid" || value === "paid" || value === "cancelled") {
    return value;
  }

  return "all";
}

export function parsePaymentMethodFilter(
  value: string | undefined | null,
): PaymentMethodFilter {
  if (
    value === "cash" ||
    value === "pix" ||
    value === "debit_card" ||
    value === "credit_card" ||
    value === "bank_transfer" ||
    value === "other"
  ) {
    return value;
  }

  return "all";
}
