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
  offerCodeForInterval,
  planCodeForInterval,
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
  resolvePlanChangeKind,
} from "@/features/subscription/subscription-ui";
import {
  computePaidPeriodEnd,
  parseBillingInterval,
  type BillingInterval,
} from "@/config/subscription";
import {
  assertMercadoPagoSandboxPayerEmail,
  BillingConfigError,
  getAppUrl,
  getMercadoPagoPayerEmailContext,
  getServerEnv,
} from "@/lib/env/server-env";
import { requireCompanyBillingContext } from "@/lib/auth/require-company-context";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";
import { requireUser } from "@/lib/auth/require-user";

/** Só dono/gestor (ou platform admin) pode iniciar/cancelar cobrança. */
async function requireSubscriptionManagerContext() {
  const context = await requireCompanyBillingContext();
  const user = await requireUser();

  if (await isPlatformAdmin(user)) {
    return context;
  }

  if (!hasPermission(context.membership, "subscription.manage")) {
    redirect("/assinatura-equipe");
  }

  return context;
}

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
  console.error("[Subscription] checkout failed", {
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

  if (error instanceof Error) {
    if (error.message === "mercado_pago_checkout_failed") {
      return "O Mercado Pago recusou iniciar o checkout. Verifique a conta MP ou tente de novo em instantes.";
    }
    if (error.message === "billing_subscription_update_failed") {
      return "Não foi possível salvar a assinatura. Confirme se a migration anual foi aplicada no Supabase.";
    }
    if (error.message === "checkout_not_allowed") {
      return "Neste momento não é possível iniciar um novo checkout para esta conta.";
    }
    if (error.message === "missing_init_point") {
      return "O Mercado Pago não retornou o link de pagamento. Tente novamente.";
    }
    if (error.message === "missing_payer_email") {
      return "Sua conta não tem e-mail para cobrança. Atualize o e-mail e tente de novo.";
    }
  }

  return "Não foi possível iniciar a assinatura. Tente novamente.";
}

/**
 * Se o cliente mensal ativo escolhe anual: cancela renovação mensal no MP
 * (acesso continua até current_period_end) e segue para checkout anual.
 * Não ativa o anual antes do pagamento.
 */
async function prepareMonthlyToAnnualUpgrade(params: {
  companyId: string;
  subscription: Awaited<ReturnType<typeof requireCompanySubscription>>;
}): Promise<Awaited<ReturnType<typeof requireCompanySubscription>>> {
  const { companyId, subscription } = params;

  if (subscription.providerSubscriptionId) {
    try {
      await cancelMercadoPagoSubscription(subscription.providerSubscriptionId);
    } catch (error) {
      console.error("[Subscription] cancel monthly before annual upgrade failed", {
        companyId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await syncSubscriptionFromProvider({
        companyId,
        providerSubscriptionId: subscription.providerSubscriptionId,
      });
    } catch (error) {
      console.error("[Subscription] sync after monthly cancel failed", {
        companyId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      // Continua: ainda precisamos abrir o checkout anual.
      await updateCompanySubscriptionBilling(companyId, {
        status: "cancelled",
        provider_status: "canceled",
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
      });
    }
  }

  const refreshed = await requireCompanySubscription(companyId);

  // Garante período pago para não cortar acesso entre o cancelamento e o pagamento anual.
  if (!refreshed.currentPeriodEnd) {
    const startIso =
      refreshed.currentPeriodStart ?? refreshed.subscribedAt ?? new Date().toISOString();
    const start = new Date(startIso);
    await updateCompanySubscriptionBilling(companyId, {
      current_period_start: startIso,
      current_period_end: computePaidPeriodEnd(start, "monthly").toISOString(),
      cancel_at_period_end: true,
    });
    return requireCompanySubscription(companyId);
  }

  return refreshed;
}

export async function createSubscriptionCheckoutAction(
  billingIntervalInput: BillingInterval = "monthly",
): Promise<void> {
  let stage = "action_started";
  logSubscriptionDevStage(stage);

  const billingInterval = parseBillingInterval(billingIntervalInput);

  try {
    const context = await requireSubscriptionManagerContext();
    stage = "user_loaded";
    logSubscriptionDevStage(stage);

    const companyId = context.membership.company.id;
    stage = "company_loaded";
    logSubscriptionDevStage(stage, { companyId, billingInterval });

    let subscription = await requireCompanySubscription(companyId);
    stage = "subscription_loaded";
    logSubscriptionDevStage(stage, {
      subscriptionStatus: subscription.status,
      providerStatus: subscription.providerStatus,
      hasProviderSubscriptionId: Boolean(subscription.providerSubscriptionId),
      hasProviderCheckoutUrl: Boolean(subscription.providerCheckoutUrl),
      billingInterval: subscription.billingInterval,
    });

    const serverNow = new Date();

    if (isTrialStillActiveServerSide(subscription, serverNow)) {
      throw new Error("trial_still_active");
    }

    stage = "trial_validated";
    logSubscriptionDevStage(stage);

    const changeKind = resolvePlanChangeKind(subscription, billingInterval);

    if (changeKind === "same_plan") {
      stage = "redirecting";
      logSubscriptionDevStage(stage, { destination: "/assinatura", reason: "same_plan" });
      redirect("/assinatura");
    }

    if (changeKind === "annual_to_monthly_blocked") {
      throw new Error("annual_to_monthly_blocked");
    }

    if (changeKind === "upgrade_to_annual") {
      stage = "upgrade_monthly_to_annual";
      logSubscriptionDevStage(stage);
      subscription = await prepareMonthlyToAnnualUpgrade({ companyId, subscription });
    }

    if (
      changeKind === "subscribe" &&
      (subscription.status === "active" || isActiveProviderSubscription(subscription.providerStatus))
    ) {
      stage = "redirecting";
      logSubscriptionDevStage(stage, { destination: "/dashboard", reason: "already_active" });
      redirect("/dashboard");
    }

    const pendingMatchesPlan =
      subscription.billingInterval === billingInterval &&
      subscription.planCode === planCodeForInterval(billingInterval);

    if (
      pendingMatchesPlan &&
      subscription.providerSubscriptionId &&
      isReusablePendingCheckout(subscription.providerStatus) &&
      subscription.providerCheckoutUrl
    ) {
      // Valida se o checkout ainda existe no MP; se expirou, recria abaixo.
      try {
        const existing = await getSubscription(subscription.providerSubscriptionId);
        if (existing.init_point && isReusablePendingCheckout(existing.status)) {
          stage = "redirecting";
          logSubscriptionDevStage(stage, {
            destination: "provider_checkout_url",
            reason: "reusable_pending_checkout",
          });
          redirect(existing.init_point);
        }
      } catch (error) {
        console.error("[Subscription] pending checkout invalid; recreating", {
          companyId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (
      pendingMatchesPlan &&
      subscription.providerSubscriptionId &&
      isReusablePendingCheckout(subscription.providerStatus)
    ) {
      try {
        const existing = await getSubscription(subscription.providerSubscriptionId);
        if (existing.init_point && isReusablePendingCheckout(existing.status)) {
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
      } catch {
        // Recria preapproval abaixo.
      }
    }

    // Checkout pendente de outro plano: descarta e cria novo (evita reabrir mensal ao escolher anual).
    if (
      subscription.providerSubscriptionId &&
      isReusablePendingCheckout(subscription.providerStatus) &&
      !pendingMatchesPlan
    ) {
      try {
        await cancelMercadoPagoSubscription(subscription.providerSubscriptionId);
      } catch {
        // Melhor esforço — seguimos com novo preapproval.
      }
    }

    if (
      changeKind === "subscribe" &&
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

    // Após upgrade, status pode ser cancelled com período — checkout permitido.
    if (
      changeKind === "subscribe" &&
      !canStartMercadoPagoCheckout(subscription, serverNow)
    ) {
      throw new Error("checkout_not_allowed");
    }

    if (
      changeKind === "upgrade_to_annual" &&
      isTrialStillActiveServerSide(subscription, serverNow)
    ) {
      throw new Error("trial_still_active");
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
      billingInterval,
    });

    assertNoFreeTrialInPayload(payload);
    assertMercadoPagoSandboxPayerEmail(payerEmail);

    stage = "before_mercado_pago";
    logSubscriptionDevStage(stage, {
      appUrl,
      backUrl,
      endpoint: "/preapproval",
      billingInterval,
      transactionAmount: payload.auto_recurring.transaction_amount,
    });

    if (isDev) {
      console.log("[MercadoPago][DEV] preapproval request", {
        ...buildSanitizedPreapprovalPayloadLog(payload),
        hasTestPayerEmail: payerContext.hasTestPayerEmail,
        payerEmailUsed: payerEmail,
        billingInterval,
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

    // Persiste plano escolhido ANTES do pagamento — status local não vira active aqui.
    // Em upgrade, preserva current_period_* do mensal até o webhook anual ativar.
    await updateCompanySubscriptionBilling(companyId, {
      plan_code: planCodeForInterval(billingInterval),
      billing_interval: billingInterval,
      offer_code: offerCodeForInterval(billingInterval),
      provider: MERCADO_PAGO_PROVIDER,
      provider_subscription_id: preapproval.id,
      provider_status: preapproval.status,
      provider_checkout_url: preapproval.init_point,
      checkout_started_at: new Date().toISOString(),
      cancel_at_period_end: changeKind === "upgrade_to_annual" ? true : false,
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
    const context = await requireSubscriptionManagerContext();
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
    const context = await requireSubscriptionManagerContext();
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
    return {
      success:
        "Renovação cancelada no Mercado Pago. Se houver período já pago, o acesso continua até o fim desse período.",
    };
  } catch {
    return { error: "Não foi possível cancelar a assinatura." };
  }
}

export async function createSubscriptionCheckoutFormAction(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  try {
    let billingInterval: BillingInterval = "monthly";
    try {
      billingInterval = parseBillingInterval(formData.get("plan") ?? "monthly");
    } catch {
      return { error: "Plano inválido. Escolha mensal ou anual." };
    }

    await createSubscriptionCheckoutAction(billingInterval);
    return {};
  } catch (error) {
    unstable_rethrow(error);

    logSubscriptionCheckoutFailed(getCheckoutFailureStage(error), error);

    if (error instanceof Error) {
      if (error.message === "trial_still_active") {
        return { error: "Seu período de teste gratuito ainda está ativo." };
      }
      if (error.message === "annual_to_monthly_blocked") {
        return {
          error:
            "O plano anual já pago vale até o fim do período. Cancele a renovação e, quando o período acabar, assine o mensal.",
        };
      }
      if (error.message === "invalid_billing_interval") {
        return { error: "Plano inválido. Escolha mensal ou anual." };
      }
      if (
        error.message === "mercado_pago_checkout_failed" ||
        error.message === "billing_subscription_update_failed" ||
        error.message === "checkout_not_allowed" ||
        error.message === "missing_init_point" ||
        error.message === "missing_payer_email"
      ) {
        return { error: mapCheckoutError(error) };
      }
      if (error.message.includes("Mercado Pago")) {
        return { error: error.message };
      }
    }
    return { error: mapCheckoutError(error) };
  }
}
