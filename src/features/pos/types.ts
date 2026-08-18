import type { DiscountType, PaymentMethod, ProductUnit, SaleStatus } from "@/types/database.types";

export type PosProductItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: ProductUnit;
  salePriceCents: number | null;
  costPriceCents: number;
  currentStock: number;
  availableStock: number;
  trackStock: boolean;
  stockStatus: "normal" | "low" | "out" | "archived";
};

export type CartLine = {
  productId: string;
  name: string;
  unit: ProductUnit;
  unitPriceCents: number;
  costPriceCents: number;
  quantity: number;
  availableStock: number;
  trackStock: boolean;
};

export type SalePaymentInput = {
  amountCents: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
};

export type SaleListItem = {
  id: string;
  saleNumber: number;
  soldAt: string;
  customerName: string | null;
  totalCents: number;
  paidCents: number;
  status: SaleStatus;
  createdByName: string;
  changeCents: number;
};

export type SalePaymentView = {
  id: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  cancelledAt: string | null;
};

export type SaleItemView = {
  id: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  costPriceCentsSnapshot: number;
  subtotalCents: number;
  totalCents: number;
};

export type SaleDetail = {
  id: string;
  saleNumber: number;
  status: SaleStatus;
  soldAt: string;
  customerId: string | null;
  customerName: string | null;
  subtotalCents: number;
  discountCents: number;
  discountType: DiscountType | null;
  discountPercent: number | null;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  createdByName: string;
  discountAppliedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  financialEntryId: string | null;
  items: SaleItemView[];
  payments: SalePaymentView[];
};

export type PosDashboardMetrics = {
  salesCountToday: number;
  totalSoldTodayCents: number;
  productsSoldToday: number;
};

export type PosSalesReport = {
  totalSoldCents: number;
  salesCount: number;
  averageTicketCents: number;
  grossMarginCents: number;
  topProducts: { productName: string; quantity: number; revenueCents: number }[];
};
