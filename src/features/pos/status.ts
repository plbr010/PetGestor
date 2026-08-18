import type { PaymentMethod, SaleStatus } from "@/types/database.types";

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  open: "Aberta",
  completed: "Concluída",
  partially_paid: "Parcialmente paga",
  cancelled: "Cancelada",
};

export type SaleStatusFilter = "all" | SaleStatus;

export function parseSaleStatusFilter(value: string | undefined | null): SaleStatusFilter {
  if (
    value === "open" ||
    value === "completed" ||
    value === "partially_paid" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "all";
}

export type SalePeriodFilter = "today" | "week" | "month" | "custom" | "all";

export function parseSalePeriodFilter(value: string | undefined | null): SalePeriodFilter {
  if (value === "today" || value === "week" || value === "month" || value === "custom") {
    return value;
  }

  return "all";
}

export type SalePaymentMethodFilter = "all" | PaymentMethod;

export function parseSalePaymentMethodFilter(
  value: string | undefined | null,
): SalePaymentMethodFilter {
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

export function canCancelSale(status: SaleStatus, cancelledAt: string | null): boolean {
  return cancelledAt == null && (status === "completed" || status === "partially_paid");
}
