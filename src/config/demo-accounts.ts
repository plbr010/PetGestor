import { demoPetShop } from "@/config/demo-data";

/**
 * Nomes de pet shop usados em contas de demonstração (screenshots, testes internos).
 * Comparação case-insensitive com trim.
 */
export const DEMO_COMPANY_NAMES = [demoPetShop.name] as const;

/**
 * IDs explícitos de empresas demo (opcional — preencher quando souber o UUID).
 */
export const DEMO_COMPANY_IDS: string[] = [];

/**
 * Padrões de e-mail típicos de contas criadas para demo/teste automatizado.
 */
export const DEMO_OWNER_EMAIL_PATTERNS = [
  /\+demo@/i,
  /@demo\./i,
  /^demo\./i,
  /cursoragent@/i,
  /users\.noreply\.github\.com/i,
] as const;

export const DEMO_CLEANUP_CONFIRMATION_PHRASE = "APAGAR DEMO" as const;

export function normalizeDemoCompanyName(name: string): string {
  return name.trim().toLowerCase();
}

export function isDemoCompanyName(name: string): boolean {
  const normalized = normalizeDemoCompanyName(name);
  return DEMO_COMPANY_NAMES.some(
    (demoName) => normalizeDemoCompanyName(demoName) === normalized,
  );
}

export function isDemoOwnerEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return DEMO_OWNER_EMAIL_PATTERNS.some((pattern) => pattern.test(normalized));
}
