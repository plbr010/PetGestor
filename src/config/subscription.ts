/**
 * Configuração central de assinatura e trial — PetGestor
 *
 * Regra comercial:
 * - 7 dias completos de teste gratuito (168 horas exatas a partir de trial_started_at)
 * - Sem cartão, Pix ou checkout durante cadastro/onboarding/trial
 * - Após trial_ends_at sem assinatura active → acesso operacional suspenso
 * - Autorização sempre server-side (PostgreSQL + servidor)
 * - Preços: apenas constantes server-side (nunca confiar no frontend)
 */

/** Fonte de verdade comercial do trial (dias completos). */
export const TRIAL_DURATION_DAYS = 7;

/** Duração real do trial em horas (= TRIAL_DURATION_DAYS × 24). */
export const TRIAL_DURATION_HOURS = TRIAL_DURATION_DAYS * 24;

export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** @deprecated Prefer PLAN_CODES.monthly — mantido para compatibilidade. */
export const PLAN_CODE = "petgestor_monthly" as const;

export const PLAN_CODES = {
  monthly: "petgestor_monthly",
  annual: "petgestor_annual",
} as const;

export type PlanCode = (typeof PLAN_CODES)[BillingInterval];

export const PLAN_MONTHLY_PRICE_CENTS = 8990;
export const PLAN_MONTHLY_PRICE_LABEL = "R$ 89,90";

export const PLAN_ANNUAL_PRICE_CENTS = 79900;
export const PLAN_ANNUAL_PRICE_LABEL = "R$ 799,00";

/** 79900 / 12 = 6658,33… → exibição comercial R$ 66,58 */
export const PLAN_ANNUAL_MONTHLY_EQUIVALENT_CENTS = 6658;
export const PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL = "R$ 66,58";

/** 12 × 8990 − 79900 = 27980 */
export const PLAN_ANNUAL_SAVINGS_CENTS = 12 * PLAN_MONTHLY_PRICE_CENTS - PLAN_ANNUAL_PRICE_CENTS;
export const PLAN_ANNUAL_SAVINGS_LABEL = "R$ 279,80";

/** Oferta de lançamento do anual (sem countdown falso). */
export const ANNUAL_OFFER_CODE_LAUNCH = "annual_launch_799" as const;

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function parseBillingInterval(value: unknown): BillingInterval {
  if (isBillingInterval(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (isBillingInterval(normalized)) {
      return normalized;
    }
  }

  throw new Error("invalid_billing_interval");
}

export function planCodeForInterval(interval: BillingInterval): PlanCode {
  return PLAN_CODES[interval];
}

export function billingIntervalFromPlanCode(planCode: string | null | undefined): BillingInterval {
  if (planCode === PLAN_CODES.annual) {
    return "annual";
  }
  return "monthly";
}

export function priceCentsForInterval(interval: BillingInterval): number {
  return interval === "annual" ? PLAN_ANNUAL_PRICE_CENTS : PLAN_MONTHLY_PRICE_CENTS;
}

export function priceLabelForInterval(interval: BillingInterval): string {
  return interval === "annual" ? PLAN_ANNUAL_PRICE_LABEL : PLAN_MONTHLY_PRICE_LABEL;
}

export function planDisplayName(interval: BillingInterval): string {
  return interval === "annual" ? "PetGestor Anual" : "PetGestor Mensal";
}

export function planPeriodLabel(interval: BillingInterval): string {
  return interval === "annual" ? "por ano" : "por mês";
}

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

/** Adiciona meses civis (ex.: 31/jan + 1 mês → último dia de fev). */
export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
}

export function addCalendarYears(date: Date, years: number): Date {
  return addCalendarMonths(date, years * 12);
}

export function computePaidPeriodEnd(startedAt: Date, interval: BillingInterval): Date {
  return interval === "annual"
    ? addCalendarYears(startedAt, 1)
    : addCalendarMonths(startedAt, 1);
}
