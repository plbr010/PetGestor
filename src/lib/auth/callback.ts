import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

const EMAIL_CONFIRM_TYPES = new Set(["email", "signup", "invite"]);

export function resolveAuthCallbackPath(input: {
  code: string | null;
  next: string | null;
  exchangeFailed: boolean;
}): string {
  if (!input.code?.trim()) {
    return "/auth/erro?motivo=callback-invalido";
  }

  if (input.exchangeFailed) {
    return "/auth/erro?motivo=callback-falhou";
  }

  return getSafeRedirectPath(input.next);
}

export function isAllowedEmailConfirmType(type: string | null): boolean {
  return Boolean(type && EMAIL_CONFIRM_TYPES.has(type));
}
