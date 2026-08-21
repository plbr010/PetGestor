import "server-only";

import { z } from "zod";

const optionalNonEmpty = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const serverEnvSchema = z.object({
  APP_URL: optionalNonEmpty,
  NEXT_PUBLIC_APP_URL: optionalNonEmpty,
  MERCADO_PAGO_ACCESS_TOKEN: optionalNonEmpty,
  MERCADO_PAGO_WEBHOOK_SECRET: optionalNonEmpty,
  MERCADO_PAGO_ENVIRONMENT: z.enum(["test", "production"]).optional().default("test"),
  MERCADO_PAGO_TEST_PAYER_EMAIL: optionalNonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
});

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

function readServerEnvSource() {
  return {
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    MERCADO_PAGO_WEBHOOK_SECRET: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    MERCADO_PAGO_ENVIRONMENT: process.env.MERCADO_PAGO_ENVIRONMENT,
    MERCADO_PAGO_TEST_PAYER_EMAIL: process.env.MERCADO_PAGO_TEST_PAYER_EMAIL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getServerEnv() {
  return serverEnvSchema.parse(readServerEnvSource());
}

export function getAppUrl(): string {
  const env = getServerEnv();
  const url = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function getMercadoPagoAccessToken(): string {
  const token = getServerEnv().MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new BillingConfigError(
      "Mercado Pago não configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN ao .env.local.",
    );
  }
  return token;
}

export function getMercadoPagoWebhookSecret(): string {
  const secret = getServerEnv().MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) {
    throw new BillingConfigError(
      "Webhook Mercado Pago não configurado. Adicione MERCADO_PAGO_WEBHOOK_SECRET ao .env.local.",
    );
  }
  return secret;
}

export function getSupabaseServiceRoleKey(): string {
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new BillingConfigError(
      "Service role não configurada. Adicione SUPABASE_SERVICE_ROLE_KEY ao .env.local.",
    );
  }
  return key;
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return Boolean(getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
}

export function isMercadoPagoConfigured(): boolean {
  const env = serverEnvSchema.safeParse(readServerEnvSource());
  return Boolean(env.success && env.data.MERCADO_PAGO_ACCESS_TOKEN);
}

export type MercadoPagoPayerEmailContext = {
  payerEmail: string;
  hasTestPayerEmail: boolean;
  usedTestPayerEmail: boolean;
};

/** Em teste, permite payer distinto do collector; em produção, sempre o e-mail autenticado. */
export function resolveMercadoPagoPayerEmail(authenticatedUserEmail: string): string {
  return getMercadoPagoPayerEmailContext(authenticatedUserEmail).payerEmail;
}

export function getMercadoPagoPayerEmailContext(
  authenticatedUserEmail: string,
): MercadoPagoPayerEmailContext {
  const env = getServerEnv();
  const hasTestPayerEmail = Boolean(env.MERCADO_PAGO_TEST_PAYER_EMAIL);
  const usedTestPayerEmail =
    env.MERCADO_PAGO_ENVIRONMENT === "test" && hasTestPayerEmail;

  return {
    payerEmail: usedTestPayerEmail
      ? env.MERCADO_PAGO_TEST_PAYER_EMAIL!
      : authenticatedUserEmail,
    hasTestPayerEmail,
    usedTestPayerEmail,
  };
}

/** Sandbox exige e-mail Comprador @testuser.com (doc MP: invalid_email_for_sandbox). */
export function assertMercadoPagoSandboxPayerEmail(payerEmail: string): void {
  const env = getServerEnv();

  if (env.MERCADO_PAGO_ENVIRONMENT !== "test") {
    return;
  }

  if (payerEmail.toLowerCase().endsWith("@testuser.com")) {
    return;
  }

  throw new BillingConfigError(
    "No ambiente de teste, payer_email deve ser o e-mail Comprador do Mercado Pago (domínio @testuser.com). Configure MERCADO_PAGO_TEST_PAYER_EMAIL no .env.local.",
  );
}
