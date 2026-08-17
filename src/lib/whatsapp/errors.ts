const TOKEN_PATTERN = /EAA[A-Za-z0-9]+/g;

export function sanitizeWhatsAppError(message: string | undefined): string {
  const raw = (message ?? "whatsapp_error").replace(TOKEN_PATTERN, "[redacted]");
  return raw.slice(0, 500);
}

const DEFINITIVE_CODES = new Set([
  "100",
  "190",
  "368",
  "131026",
  "131047",
  "131051",
  "132000",
  "132001",
  "132005",
  "132007",
  "132012",
  "132015",
  "133010",
  "invalid_phone",
  "template_not_configured",
  "whatsapp_not_configured",
]);

export function isRetryableWhatsAppFailure(input: {
  httpStatus?: number;
  errorCode?: string;
}): boolean {
  const code = input.errorCode ?? "";

  if (DEFINITIVE_CODES.has(code)) {
    return false;
  }

  if (input.httpStatus === 429) {
    return true;
  }

  if (input.httpStatus && input.httpStatus >= 500) {
    return true;
  }

  if (input.httpStatus && input.httpStatus >= 400 && input.httpStatus < 500) {
    return false;
  }

  return true;
}

export function extractGraphError(body: unknown): { code: string; message: string } {
  if (!body || typeof body !== "object") {
    return { code: "unknown", message: "whatsapp_error" };
  }

  const error = (body as { error?: { code?: number | string; message?: string } }).error;

  if (!error) {
    return { code: "unknown", message: "whatsapp_error" };
  }

  return {
    code: String(error.code ?? "unknown"),
    message: sanitizeWhatsAppError(error.message),
  };
}
