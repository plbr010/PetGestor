const RAW_ENGLISH =
  /^(Invalid(?: input| type| email| string| option)?|Required|Expected .+|Too small|Too big|Required)/i;

export function firstIssueMessage(
  issues: Array<{ message: string }> | undefined,
  fallback = "Dados inválidos.",
): string {
  const message = issues?.[0]?.message?.trim();
  if (!message || RAW_ENGLISH.test(message)) {
    return fallback;
  }

  return message;
}
