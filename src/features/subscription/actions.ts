"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { updateCompanySubscriptionBilling } from "@/features/subscription/billing-repository";
import {
  isActiveProviderSubscription,
  isCancelledProviderSubscription,
  isReusablePendingCheckout,
} from "@/features/subscription/provider-status";
import {
  assertNoFreeTrialInPayload,
  buildCreatePendingPreapprovalPayload,
  buildSanitizedPreapprovalPayloadLog,
  MERCADO_PAGO_PROVIDER,
} from "@/features/subscription/providers/mercado-pago-types";
import {
  createPendingSubscription,
  getSubscription,
  cancelSubscription as cancelMercadoPagoSubscription,
} from "@/features/subscription/providers/mercado-pago";
import { getCompanySubscription, requireCompanySubscription } from "@/features/subscription/queries";
import { syncSubscriptionFromProvider } from "@/features/subscription/sync";
import {
  canStartMercadoPagoCheckout,
  isTrialStillActiveServerSide,
} from "@/features/subscription/subscription-ui";
import {
  assertMercadoPagoSandboxPayerEmail,
  BillingConfigError,
  getAppUrl,
  getMercadoPagoPayerEmailContext,
  getServerEnv,
} from "@/lib/env/server-env";
import { requireCompanyBillingContext } from "@/lib/auth/require-company-context";

export type SubscriptionActionState = {
  error?: string;
  success?: string;
};

const isDev = process.env.NODE_ENV === "development";

function logSubscriptionDevStage(stage: string, details?: Record<string, unknown>) {
  if (!isDev) {
    return;
  }

  if (details) {
    console.log("[Subscription][DEV] stage:", stage, details);
    return;
  }

  console.log("[Subscription][DEV] stage:", stage);
}

function getSubscriptionDevEnvSnapshot() {
  const env = getServerEnv();

  return {
    hasMercadoPagoAccessToken: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN),
    hasSupabaseServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    hasAppUrl: Boolean(env.APP_URL ?? env.NEXT_PUBLIC_APP_URL),
    appUrl: getAppUrl(),
    environment: env.MERCADO_PAGO_ENVIRONMENT,
  };
}

function extractSafeCheckoutErrorFields(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return {};
  }

  const fields: Record<string, unknown> = {};
  const record = error as Record<string, unknown>;

  if (typeof record.status === "number") {
    fields.status = record.status;
  }

  if (typeof record.code === "string") {
    fields.code = record.code;
  }

  if (typeof record.message === "string" && record.message !== (error as Error).message) {
    fields.message = record.message;
  }

  return fields;
}

function annotateCheckoutErrorStage(error: unknown, stage: string) {
  if (error && typeof error === "object") {
    (error as { subscriptionCheckoutStage?: string }).subscriptionCheckoutStage = stage;
  }
}

function logSubscriptionCheckoutFailed(stage: string, error: unknown) {
  if (!isDev) {
    return;
  }

  console.error("[Subscription][DEV] checkout failed", {
    stage,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
    ...extractSafeCheckoutErrorFields(error),
  });
}

function getCheckoutFailureStage(error: unknown): string {
  if (error && typeof error === "object" && "subscriptionCheckoutStage" in error) {
    const stage = (error as { subscriptionCheckoutStage?: unknown }).subscriptionCheckoutStage;
    if (typeof stage === "string") {
      return stage;
    }
  }

  return "unknown";
}

function mapCheckoutError(error: unknown): string {
  if (error instanceof BillingConfigError) {
    return "Mercado Pago ainda não está configurado neste ambiente.";
  }

  return "Não foi possível iniciar a assinatura. Tente novamente.";
}

export async function createSubscriptionCheckoutAction(): Promise<void> {
  let stage = "action_started";
  logSubscriptionDevStage(stage);

  try {
    const context = await requireCompanyBillingContext();
    stage = "user_loaded";
    logSubscriptionDevStage(stage);

    const companyId = context.membership.company.id;
    stage = "company_loaded";
    logSubscriptionDevStage(stage, { companyId });

    const subscription = await requireCompanySubscription(companyId);
    stage = "subscription_loaded";
    logSubscriptionDevStage(stage, {
      subscriptionStatus: subscription.status,
      providerStatus: subscription.providerStatus,
      hasProviderSubscriptionId: Boolean(subscription.providerSubscriptionId),
      hasProviderCheckoutUrl: Boolean(subscription.providerCheckoutUrl),
    });

    const serverNow = new Date();

    if (isTrialStillActiveServerSide(subscription, serverNow)) {
      throw new Error("trial_still_active");
    }

    stage = "trial_validated";
    logSubscriptionDevStage(stage);

    if (subscription.status === "active" || isActiveProviderSubscription(subscription.providerStatus)) {
      stage = "redirecting";
      logSubscriptionDevStage(stage, { destination: "/dashboard", reason: "already_active" });
      redirect("/dashboard");
    }

    if (
      subscription.providerSubscriptionId &&
      isReusablePendingCheckout(subscription.providerStatus) &&
      subscription.providerCheckoutUrl
    ) {
      stage = "redirecting";
      logSubscriptionDevStage(stage, {
        destination: "provider_checkout_url",
        reason: "reusable_pending_checkout",
      });
      redirect(subscription.providerCheckoutUrl);
    }

    if (
      subscription.providerSubscriptionId &&
      isReusablePendingCheckout(subscription.providerStatus)
    ) {
      const existing = await getSubscription(subscription.providerSubscriptionId);
      if (existing.init_point) {
        await updateCompanySubscriptionBilling(companyId, {
          provider_checkout_url: existing.init_point,
          provider_status: existing.status,
        });
        stage = "redirecting";
        logSubscriptionDevStage(stage, {
          destination: "init_point",
          reason: "existing_pending_init_point",
        });
        redirect(existing.init_point);
      }
    }

    if (
      subscription.providerSubscriptionId &&
      !isCancelledProviderSubscription(subscription.providerStatus) &&
      !isReusablePendingCheckout(subscription.providerStatus)
    ) {
      await syncSubscriptionFromProvider({ companyId });
      const refreshed = await getCompanySubscription(companyId);
      if (refreshed?.status === "active") {
        stage = "redirecting";
        logSubscriptionDevStage(stage, { destination: "/dashboard", reason: "synced_active" });
        redirect("/dashboard");
      }
    }

    if (!canStartMercadoPagoCheckout(subscription, serverNow)) {
      throw new Error("checkout_not_allowed");
    }

    const authenticatedEmail = context.user.email;
    if (!authenticatedEmail) {
      throw new Error("missing_payer_email");
    }

    const payerContext = getMercadoPagoPayerEmailContext(authenticatedEmail);
    const payerEmail = payerContext.payerEmail;

    stage = "env_loaded";
    logSubscriptionDevStage(stage, getSubscriptionDevEnvSnapshot());

    stage = "admin_client_ready";
    logSubscriptionDevStage(stage, {
      hasSupabaseServiceRoleKey: Boolean(getServerEnv().SUPABASE_SERVICE_ROLE_KEY),
    });

    const appUrl = getAppUrl();
    const backUrl = new URL("/assinatura/retorno", appUrl).toString();

    const payload = buildCreatePendingPreapprovalPayload({
      companyId,
      payerEmail,
      backUrl,
    });

    assertNoFreeTrialInPayload(payload);
    assertMercadoPagoSandboxPayerEmail(payerEmail);

    stage = "before_mercado_pago";
    logSubscriptionDevStage(stage, {
      appUrl,
      backUrl,
      endpoint: "/preapproval",
    });

    if (isDev) {
      console.log("[MercadoPago][DEV] preapproval request", {
        ...buildSanitizedPreapprovalPayloadLog(payload),
        hasTestPayerEmail: payerContext.hasTestPayerEmail,
        payerEmailUsed: payerEmail,
      });
    }

    let preapproval;
    try {
      preapproval = await createPendingSubscription(payload);
    } catch (error) {
      annotateCheckoutErrorStage(error, "before_mercado_pago");
      if (error instanceof BillingConfigError) {
        throw error;
      }
      const checkoutError = new Error("mercado_pago_checkout_failed");
      annotateCheckoutErrorStage(checkoutError, "before_mercado_pago");
      throw checkoutError;
    }

    stage = "mercado_pago_response";
    logSubscriptionDevStage(stage, {
      preapprovalId: preapproval.id,
      providerStatus: preapproval.status,
      hasInitPoint: Boolean(preapproval.init_point),
    });

    if (!preapproval.init_point) {
      throw new Error("missing_init_point");
    }

    await updateCompanySubscriptionBilling(companyId, {
      provider: MERCADO_PAGO_PROVIDER,
      provider_subscription_id: preapproval.id,
      provider_status: preapproval.status,
      provider_checkout_url: preapproval.init_point,
      checkout_started_at: new Date().toISOString(),
    });

    stage = "local_subscription_updated";
    logSubscriptionDevStage(stage);

    revalidatePath("/assinatura");

    stage = "redirecting";
    logSubscriptionDevStage(stage, { destination: "init_point", reason: "new_checkout" });
    redirect(preapproval.init_point);
  } catch (error) {
    annotateCheckoutErrorStage(error, stage);
    throw error;
  }
}

export async function refreshSubscriptionStatusAction(): Promise<SubscriptionActionState> {
  try {
    const context = await requireCompanyBillingContext();
    const subscription = await requireCompanySubscription(context.membership.company.id);

    if (!subscription.providerSubscriptionId) {
      return { error: "Nenhuma assinatura Mercado Pago encontrada para sincronizar." };
    }

    await syncSubscriptionFromProvider({
      companyId: context.membership.company.id,
      providerSubscriptionId: subscription.providerSubscriptionId,
    });

    revalidatePath("/assinatura");
    revalidatePath("/dashboard");
    return { success: "Assinatura sincronizada com o Mercado Pago." };
  } catch {
    return { error: "Não foi possível confirmar o pagamento." };
  }
}

export async function cancelSubscriptionAction(): Promise<SubscriptionActionState> {
  try {
    const context = await requireCompanyBillingContext();
    const subscription = await requireCompanySubscription(context.membership.company.id);

    if (!subscription.providerSubscriptionId) {
      return { error: "Nenhuma assinatura ativa para cancelar." };
    }

    if (subscription.status !== "active" && subscription.status !== "past_due") {
      return { error: "Somente assinaturas ativas ou pendentes de pagamento podem ser canceladas." };
    }

    await cancelMercadoPagoSubscription(subscription.providerSubscriptionId);
    await syncSubscriptionFromProvider({
      companyId: context.membership.company.id,
      providerSubscriptionId: subscription.providerSubscriptionId,
    });

    revalidatePath("/assinatura");
    revalidatePath("/dashboard");
    return { success: "Assinatura cancelada." };
  } catch {
    return { error: "Não foi possível cancelar a assinatura." };
  }
}

export async function createSubscriptionCheckoutFormAction(): Promise<SubscriptionActionState> {
  try {
    await createSubscriptionCheckoutAction();
    return {};
  } catch (error) {
    unstable_rethrow(error);

    logSubscriptionCheckoutFailed(getCheckoutFailureStage(error), error);

    if (error instanceof Error) {
      if (error.message === "trial_still_active") {
        return { error: "Seu período de teste gratuito ainda está ativo." };
      }
      if (error.message.includes("Mercado Pago")) {
        return { error: error.message };
      }
    }
    return { error: mapCheckoutError(error) };
  }
}
