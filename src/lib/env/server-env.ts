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
  let url = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;

  // Em deploy Vercel, evita back_url localhost se APP_URL não estiver setada.
  const vercelUrl = process.env.VERCEL_URL?.replace(/\/$/, "");
  if ((!url || /localhost|127\.0\.0\.1/i.test(url)) && vercelUrl) {
    url = `https://${vercelUrl}`;
  }

  if (!url) {
    url = "http://localhost:3000";
  }

  return url.replace(/\/$/, "");
}

/**
 * Valida config mínima antes do POST /preapproval.
 * Falhas aqui viram mensagem clara (não “recusou checkout” genérico).
 */
export function assertMercadoPagoCheckoutReady(backUrl: string): void {
  const env = getServerEnv();
  const token = env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!token) {
    throw new BillingConfigError(
      "Mercado Pago não configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN na Vercel.",
    );
  }

  const looksLikeTestToken =
    token.startsWith("TEST-") || token.includes("TEST");
  // Tokens de produção do MP costumam começar com APP_USR- (sem "TEST").
  const looksLikeProdToken = token.startsWith("APP_USR-") && !looksLikeTestToken;

  if (env.MERCADO_PAGO_ENVIRONMENT === "production" && looksLikeTestToken) {
    throw new BillingConfigError(
      "MERCADO_PAGO_ENVIRONMENT=production, mas o Access Token parece de teste. Use as Credenciais de produção na Vercel.",
    );
  }

  if (env.MERCADO_PAGO_ENVIRONMENT === "test" && looksLikeProdToken) {
    throw new BillingConfigError(
      "MERCADO_PAGO_ENVIRONMENT=test, mas o Access Token parece de produção. Na Vercel Production use ENVIRONMENT=production com token de produção.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(backUrl);
  } catch {
    throw new BillingConfigError(
      "APP_URL inválida. Configure APP_URL com a URL HTTPS pública do app (ex.: https://seu-app.vercel.app).",
    );
  }

  if (parsed.protocol !== "https:" && env.MERCADO_PAGO_ENVIRONMENT === "production") {
    throw new BillingConfigError(
      "Em produção o Mercado Pago exige back_url HTTPS. Configure APP_URL com https://…",
    );
  }

  if (/localhost|127\.0\.0\.1/i.test(parsed.hostname) && process.env.VERCEL) {
    throw new BillingConfigError(
      "APP_URL aponta para localhost neste deploy. Defina APP_URL=https://pet-gestor-sepia.vercel.app (ou seu domínio) na Vercel e faça redeploy.",
    );
  }
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
