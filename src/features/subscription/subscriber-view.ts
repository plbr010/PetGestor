export type SubscriberPageState =
  | "trial_active"
  | "trial_expired"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "cancelled";

export type SubscriberBadge =
  | "TRIAL"
  | "ATIVO"
  | "PAGAMENTO PENDENTE"
  | "INADIMPLENTE"
  | "CANCELADO"
  | "EXPIRADO";

/** Texto seguro quando a integração não persiste marca/últimos dígitos do cartão. */
export const PAYMENT_METHOD_MANAGED_BY_MP =
  "Forma de pagamento gerenciada pelo Mercado Pago";

export function resolveSubscriberBadge(pageState: SubscriberPageState): SubscriberBadge {
  switch (pageState) {
    case "trial_active":
      return "TRIAL";
    case "active":
      return "ATIVO";
    case "checkout_pending":
      return "PAGAMENTO PENDENTE";
    case "past_due":
      return "INADIMPLENTE";
    case "cancelled":
      return "CANCELADO";
    default:
      return "EXPIRADO";
  }
}

export function shouldShowRegularizeCta(pageState: SubscriberPageState): boolean {
  return pageState === "past_due";
}

export function shouldShowCancelCta(pageState: SubscriberPageState): boolean {
  return pageState === "active";
}
