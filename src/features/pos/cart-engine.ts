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

export type SettledCheckout = {
  appliedPayments: SalePaymentInput[];
  appliedCashCents: number;
  cashReceivedCents: number;
  changeCents: number;
  paidCents: number;
};

/**
 * Separa dinheiro tendered (cash_received) do payment cash aplicado.
 * Troco nunca entra como receita.
 */
export function settleCheckoutPayments(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): { ok: true; value: SettledCheckout } | { ok: false; error: string } {
  if (payments.length === 0) {
    return { ok: false, error: "empty_payments" };
  }

  if (totalCents <= 0) {
    return { ok: false, error: "sale_total_zero" };
  }

  const nonCash: SalePaymentInput[] = [];
  const cashLines: SalePaymentInput[] = [];

  for (const payment of payments) {
    if (payment.amountCents <= 0) {
      return { ok: false, error: "invalid_payment_amount" };
    }

    if (payment.paymentMethod === "cash") {
      cashLines.push(payment);
    } else {
      nonCash.push(payment);
    }
  }

  const nonCashSum = sumPaymentsCents(nonCash);
  if (nonCashSum > totalCents) {
    return { ok: false, error: "payment_exceeds_total" };
  }

  const remainingAfterNonCash = totalCents - nonCashSum;
  if (remainingAfterNonCash === 0 && cashLines.length > 0) {
    return { ok: false, error: "payment_exceeds_total" };
  }

  const requestedCash = sumPaymentsCents(cashLines);
  const tendered = cashLines.length === 0 ? 0 : (cashReceivedCents ?? requestedCash);

  if (cashLines.length === 0) {
    return {
      ok: true,
      value: {
        appliedPayments: nonCash,
        appliedCashCents: 0,
        cashReceivedCents: 0,
        changeCents: 0,
        paidCents: nonCashSum,
      },
    };
  }

  if (cashReceivedCents == null && requestedCash > remainingAfterNonCash) {
    return { ok: false, error: "payment_exceeds_total" };
  }

  if (tendered < 0) {
    return { ok: false, error: "invalid_cash_received" };
  }

  const appliedCash = Math.min(requestedCash, remainingAfterNonCash, tendered);
  const changeCents = Math.max(0, tendered - appliedCash);

  if (nonCashSum + appliedCash > totalCents) {
    return { ok: false, error: "payment_exceeds_total" };
  }

  const appliedPayments: SalePaymentInput[] = [...nonCash];
  let cashLeft = appliedCash;

  for (const line of cashLines) {
    if (cashLeft <= 0) {
      break;
    }
    const take = Math.min(line.amountCents, cashLeft);
    if (take > 0) {
      appliedPayments.push({ ...line, amountCents: take });
      cashLeft -= take;
    }
  }

  return {
    ok: true,
    value: {
      appliedPayments,
      appliedCashCents: appliedCash,
      cashReceivedCents: tendered,
      changeCents,
      paidCents: nonCashSum + appliedCash,
    },
  };
}

export function computeChangeCents(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): number {
  const settled = settleCheckoutPayments(totalCents, payments, cashReceivedCents);
  if (!settled.ok) {
    return 0;
  }

  return settled.value.changeCents;
}

export function computeEffectivePaidCents(
  totalCents: number,
  payments: SalePaymentInput[],
  cashReceivedCents: number | null,
): number {
  const settled = settleCheckoutPayments(totalCents, payments, cashReceivedCents);
  if (!settled.ok) {
    return Math.min(sumPaymentsCents(payments), totalCents);
  }

  return settled.value.paidCents;
}

export function determineSaleStatus(totalCents: number, paidCents: number): SaleStatus {
  if (paidCents >= totalCents && totalCents > 0) {
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

  const settled = settleCheckoutPayments(totalCents, payments, cashReceivedCents);
  if (!settled.ok) {
    if (settled.error === "payment_exceeds_total") {
      return "Pagamento excede o total sem troco válido.";
    }
    if (settled.error === "empty_payments") {
      return "Informe ao menos uma forma de pagamento.";
    }
    if (settled.error === "invalid_payment_amount") {
      return "Valor de pagamento inválido.";
    }
    return "Pagamento inválido.";
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

export function buildRpcItemsPayload(lines: Array<{ productId: string; quantity: number }>) {
  return lines.map((line) => ({
    product_id: line.productId,
    quantity: roundQuantity(line.quantity),
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
