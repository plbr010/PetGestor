/**
 * Configuração central de assinatura e trial — PetGestor
 *
 * Regra comercial:
 * - 72 horas de teste gratuito (exatamente 3 dias corridos por hora)
 * - Sem cartão, Pix ou checkout durante cadastro/onboarding/trial
 * - Após trial_ends_at sem assinatura active → acesso operacional suspenso
 * - Autorização sempre server-side (PostgreSQL + servidor)
 */

export const TRIAL_DURATION_HOURS = 72;

/** Referência comercial para marketing ("3 dias") — duração real = TRIAL_DURATION_HOURS */
export const TRIAL_DURATION_DAYS = 3;

export const PLAN_CODE = "petgestor_monthly" as const;

export const PLAN_MONTHLY_PRICE_CENTS = 8990;

export const PLAN_MONTHLY_PRICE_LABEL = "R$ 89,90";

export function formatTrialPeriodLabel(): string {
  return `${TRIAL_DURATION_DAYS} dias`;
}

export function formatTrialCtaLabel(): string {
  return `Teste grátis por ${TRIAL_DURATION_DAYS} dias`;
}

export function formatTrialNote(): string {
  return `Teste grátis por ${TRIAL_DURATION_DAYS} dias. Sem cartão.`;
}

export function isBillingDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.BILLING_DEV_BYPASS === "true";
}
