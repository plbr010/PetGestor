import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { SALE_STATUS_LABELS } from "@/features/pos/status";
import { formatCentsToBRL } from "@/lib/money";
import type { PaymentMethod, SaleStatus } from "@/types/database.types";

export function mapPosError(message: string | undefined): string {
  const code = message ?? "";

  if (code.includes("insufficient_stock")) {
    return "Estoque insuficiente para um ou mais produtos.";
  }

  if (code.includes("product_not_available")) {
    return "Produto indisponível ou arquivado.";
  }

  if (code.includes("discount_exceeds_subtotal")) {
    return "Desconto maior que o subtotal.";
  }

  if (code.includes("payment_exceeds_total")) {
    return "Pagamento excede o total da venda.";
  }

  if (code.includes("empty_sale_items")) {
    return "Adicione produtos ao carrinho.";
  }

  if (code.includes("empty_payments")) {
    return "Informe ao menos uma forma de pagamento.";
  }

  if (code.includes("sale_already_cancelled")) {
    return "Esta venda já foi cancelada.";
  }

  if (code.includes("invalid_cancel_reason")) {
    return "Informe um motivo com pelo menos 3 caracteres.";
  }

  if (code.includes("sale_not_found")) {
    return "Venda não encontrada.";
  }

  return "Não foi possível concluir a operação. Verifique os dados e tente novamente.";
}

export function formatSaleNumber(saleNumber: number): string {
  return `#${String(saleNumber).padStart(5, "0")}`;
}

export function getSaleStatusLabel(status: SaleStatus): string {
  return SALE_STATUS_LABELS[status];
}

export function formatPaymentMethodsSummary(
  payments: { paymentMethod: PaymentMethod; amountCents: number }[],
): string {
  if (payments.length === 0) {
    return "—";
  }

  return payments
    .map((p) => `${PAYMENT_METHOD_LABELS[p.paymentMethod]} ${formatCentsToBRL(p.amountCents)}`)
    .join(" · ");
}

export function buildPosHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/dashboard/pdv/vendas?${query}` : "/dashboard/pdv/vendas";
}
