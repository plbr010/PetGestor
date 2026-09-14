export type ProviderErrorKind =
  | "timeout"
  | "rate_limited"
  | "server_error"
  | "invalid_credentials"
  | "not_configured"
  | "rejected_payment"
  | "unknown";

export function classifyProviderHttpStatus(status: number | null | undefined): ProviderErrorKind | null {
  if (status === 401 || status === 403) {
    return "invalid_credentials";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (typeof status === "number" && status >= 500) {
    return "server_error";
  }
  return null;
}

export function classifyProviderError(error: unknown): ProviderErrorKind {
  if (error && typeof error === "object") {
    const record = error as { name?: unknown; status?: unknown; message?: unknown; code?: unknown };

    if (record.name === "BillingConfigError") {
      return "not_configured";
    }

    if (record.name === "AbortError" || record.code === "ABORT_ERR") {
      return "timeout";
    }

    if (typeof record.status === "number") {
      const byStatus = classifyProviderHttpStatus(record.status);
      if (byStatus) {
        return byStatus;
      }
    }

    if (typeof record.message === "string") {
      const message = record.message.toLowerCase();
      if (message.includes("timeout") || message.includes("aborted")) {
        return "timeout";
      }
      if (message === "rejected" || message.includes("payment_rejected")) {
        return "rejected_payment";
      }
    }
  }

  return "unknown";
}

/** Mensagens pt-BR seguras — nunca vazam token, payload ou stack. */
export function userMessageForProviderError(kind: ProviderErrorKind): string {
  switch (kind) {
    case "timeout":
      return "O Mercado Pago demorou para responder. Tente novamente em instantes.";
    case "rate_limited":
      return "Muitas tentativas no momento. Aguarde um pouco e tente de novo.";
    case "server_error":
      return "O Mercado Pago está instável agora. Tente novamente em instantes.";
    case "invalid_credentials":
      return "A cobrança não está configurada corretamente neste ambiente.";
    case "not_configured":
      return "Mercado Pago ainda não está configurado neste ambiente.";
    case "rejected_payment":
      return "O pagamento não foi aprovado. Você pode regularizar com outro meio.";
    default:
      return "Não foi possível concluir a operação de cobrança. Tente novamente.";
  }
}

export function isTransientProviderFailure(kind: ProviderErrorKind): boolean {
  return kind === "timeout" || kind === "rate_limited" || kind === "server_error";
}
