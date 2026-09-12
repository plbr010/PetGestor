const SENSITIVE_KEY =
  /(password|passwd|secret|token|authorization|refresh|access_token|id_token|magic.?link|token_hash|recovery|otp|code)$/i;

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at < 1 || at === trimmed.length - 1) {
    return "(redacted)";
  }

  const user = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = user.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function redactLogDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEY.test(key)) {
      redacted[key] = "[redacted]";
      continue;
    }

    if (key.toLowerCase() === "email" && typeof value === "string") {
      redacted[key] = maskEmail(value);
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

export function logAuthEvent(
  scope: string,
  details: Record<string, unknown>,
): void {
  console.error(`[Auth][${scope}]`, redactLogDetails(details));
}
