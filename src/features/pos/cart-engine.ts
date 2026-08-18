import { roundQuantity } from "@/features/inventory/stock-engine";
import type { CartLine, SalePaymentInput } from "@/features/pos/types";
import type { DiscountType, PaymentMethod, SaleStatus } from "@/types/database.types";

export type DiscountInput = {
  type: DiscountType | null;
  fixedCents: number;
  percent: number | null;
};

export function computeLineSubtotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(roundQuantity(quantity) * unitPriceCents);
}

export function computeCartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce(
    (sum, line) => sum + computeLineSubtotalCents(line.quantity, line.unitPriceCents),
    0,
  );
}

export function computeDiscountCents(subtotalCents: number, discount: DiscountInput): number {
  if (discount.type === "fixed") {
    return Math.max(0, Math.min(subtotalCents, discount.fixedCents));
  }

  if (discount.type === "percent" && discount.percent != null) {
    const pct = Math.max(0, Math.min(100, discount.percent));
    return Math.round(subtotalCents * (pct / 100));
  }

  return 0;
}

export function computeCartTotalCents(subtotalCents: number, discountCents: number): number {
  return Math.max(0, subtotalCents - discountCents);
}

export function sumPaymentsCents(payments: Pick<SalePaymentInput, "amountCents">[]): number {
  return payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}

export function computeChangeCents(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): number {
  const paid = sumPaymentsCents(payments);

  if (cashReceivedCents != null && cashReceivedCents >= totalCents && paid >= totalCents) {
    return Math.max(0, cashReceivedCents - totalCents);
  }

  if (paid > totalCents) {
    return paid - totalCents;
  }

  return 0;
}

export function computeEffectivePaidCents(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): number {
  const paid = sumPaymentsCents(payments);

  if (paid > totalCents) {
    if (cashReceivedCents != null && cashReceivedCents >= paid) {
      return totalCents;
    }
  }

  return Math.min(paid, totalCents);
}

export function determineSaleStatus(totalCents: number, paidCents: number): SaleStatus {
  if (paidCents <= 0) {
    return "completed";
  }

  if (paidCents >= totalCents) {
    return "completed";
  }

  return "partially_paid";
}

export function validateCartQuantity(line: CartLine, nextQuantity: number): string | null {
  const qty = roundQuantity(nextQuantity);

  if (qty <= 0) {
    return "Informe uma quantidade válida.";
  }

  if (line.trackStock && qty > line.availableStock) {
    return "Quantidade acima do estoque disponível.";
  }

  return null;
}

export function validatePayments(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): string | null {
  if (payments.length === 0) {
    return "Informe ao menos uma forma de pagamento.";
  }

  for (const payment of payments) {
    if (payment.amountCents <= 0) {
      return "Valor de pagamento inválido.";
    }
  }

  const paid = sumPaymentsCents(payments);

  if (paid > totalCents) {
    const hasCash = payments.some((p) => p.paymentMethod === "cash");
    if (!hasCash || cashReceivedCents == null || cashReceivedCents < paid) {
      return "Pagamento excede o total sem troco válido.";
    }
  }

  return null;
}

export function computeGrossMarginCents(
  items: { quantity: number; unitPriceCents: number; costPriceCentsSnapshot: number }[],
): number {
  return items.reduce((sum, item) => {
    const revenue = Math.round(item.quantity * item.unitPriceCents);
    const cost = Math.round(item.quantity * item.costPriceCentsSnapshot);
    return sum + (revenue - cost);
  }, 0);
}

export function buildRpcItemsPayload(lines: CartLine[]) {
  return lines.map((line) => ({
    product_id: line.productId,
    quantity: roundQuantity(line.quantity),
    unit_price_cents: line.unitPriceCents,
  }));
}

export function buildRpcPaymentsPayload(
  payments: SalePaymentInput[],
): { amount_cents: number; payment_method: PaymentMethod; idempotency_key: string }[] {
  return payments.map((payment) => ({
    amount_cents: payment.amountCents,
    payment_method: payment.paymentMethod,
    idempotency_key: payment.idempotencyKey,
  }));
}
