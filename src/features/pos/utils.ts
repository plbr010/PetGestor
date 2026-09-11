import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { SALE_STATUS_LABELS } from "@/features/pos/status";
import { formatCentsToBRL } from "@/lib/money";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import type { PaymentMethod, SaleStatus } from "@/types/database.types";

export function mapPosError(message: string | undefined): string {
  const code = message ?? "";

  if (code.includes("insufficient_stock")) {
    return "Estoque insuficiente para um ou mais produtos.";
  }

  if (code.includes("product_not_available") || code.includes("invalid_price_cents")) {
    return "Produto indisponível ou sem preço de venda válido.";
  }

  if (code.includes("sale_total_zero")) {
    return "O total da venda deve ser maior que zero.";
  }

  if (code.includes("amount_overflow")) {
    return "O valor da venda excede o limite permitido.";
  }

  if (code.includes("idempotency_key_conflict")) {
    return "Esta tentativa de venda conflita com outra já registrada.";
  }

  if (code.includes("sale_paid_requires_refund")) {
    return "Venda com pagamento registrado não pode ser cancelada sem política de estorno.";
  }

  if (code.includes("cash_session_required")) {
    return "Abra o caixa para receber pagamento em dinheiro.";
  }

  if (code.includes("discount_permission_required")) {
    return "Você não tem permissão para aplicar desconto.";
  }

  if (code.includes("not_found") || code.includes("P0002")) {
    return GENERIC_NOT_FOUND_MESSAGE;
  }

  if (code.includes("discount_exceeds_subtotal")) {
    return "Desconto maior que o subtotal.";
  }

  if (code.includes("payment_exceeds_total") || code.includes("payment_exceeds_balance")) {
    return "O pagamento não pode ultrapassar o saldo pendente.";
  }

  if (code.includes("sale_already_paid")) {
    return "Esta venda já está totalmente paga.";
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

  if (code.includes("invalid_payment_amount")) {
    return "Informe um valor de pagamento válido.";
  }

  if (code.includes("invalid_payment_method")) {
    return "Forma de pagamento inválida.";
  }

  if (code.includes("invalid_idempotency_key")) {
    return "Chave de idempotência inválida. Recarregue e tente novamente.";
  }

  if (code.includes("cash_session_already_open")) {
    return "Já existe um caixa aberto. Feche-o antes de abrir outro.";
  }

  if (code.includes("cash_session_already_closed")) {
    return "Esta sessão de caixa já foi fechada.";
  }

  if (code.includes("cash_session_not_found")) {
    return "Sessão de caixa não encontrada.";
  }

  if (code.includes("invalid_opening_balance") || code.includes("invalid_counted_cash")) {
    return "Informe um valor em dinheiro válido.";
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
