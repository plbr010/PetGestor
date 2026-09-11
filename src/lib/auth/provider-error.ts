export function isAuthProviderUnavailable(error: {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}): boolean {
  const status = error.status ?? 0;
  if (status >= 500 || status === 429) {
    return true;
  }

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();

  return (
    code.includes("over_request") ||
    code.includes("over_email") ||
    code.includes("over_sms") ||
    code === "unavailable" ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("network") ||
    name.includes("fetch")
  );
}

export function logAuthDiagnostic(
  scope: string,
  error: {
    message?: string;
    status?: number;
    code?: string;
    name?: string;
  },
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[Auth][${scope}]`, {
    status: error.status ?? null,
    code: "code" in error ? error.code ?? null : null,
    name: error.name ?? null,
  });
}
