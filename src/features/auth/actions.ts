"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  loginSchema,
  newPasswordSchema,
  onboardingSchema,
  passwordRecoverySchema,
  signUpSchema,
  staffSignUpSchema,
} from "@/features/auth/schemas";
import {
  peekPendingInvite,
  resolveAuthLandingPath,
} from "@/features/employees/access/accept-invite";
import { getSiteUrl } from "@/lib/auth/get-site-url";
import { isAuthProviderUnavailable, logAuthDiagnostic } from "@/lib/auth/provider-error";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { buildDashboardTrialStartedHref } from "@/lib/analytics/meta-pixel";
import { enforceAuthRateLimit } from "@/lib/security/enforce-rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: string;
  retryAfterSeconds?: number;
};

const ONBOARDING_ERROR_MESSAGE =
  "Não foi possível concluir a configuração inicial. Tente novamente em instantes.";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";

const REVOKED_ACCESS_MESSAGE =
  "Seu acesso a esta empresa foi revogado. Entre em contato com o administrador.";

const GENERIC_SIGNUP_MESSAGE =
  "Não foi possível concluir o cadastro. Se você já tem conta, entre ou recupere a senha.";

const PROVIDER_UNAVAILABLE_MESSAGE =
  "Serviço temporariamente indisponível. Tente novamente em instantes.";

const GENERIC_RECOVERY_MESSAGE =
  "Se houver uma conta associada a esse e-mail, enviaremos as instruções.";

const GENERIC_RESEND_MESSAGE =
  "Se o e-mail estiver cadastrado e ainda pendente de confirmação, enviaremos um novo link.";

function genericAuthError(): AuthActionState {
  return { error: "E-mail ou senha incorretos." };
}

function rateLimitedState(retryAfterSeconds?: number): AuthActionState {
  return {
    error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    retryAfterSeconds,
  };
}

function logOnboardingStep(
  step: string,
  details: { ok: boolean; code?: string; message?: string },
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[onboarding:${step}]`, {
    ok: details.ok,
    code: details.code ?? null,
  });
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const mode = formData.get("mode")?.toString() === "staff" ? "staff" : "owner";

  if (mode === "staff") {
    return signUpStaffAction(_prevState, formData);
  }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = await enforceAuthRateLimit("signup", parsed.data.email);
  if (limited) {
    return rateLimitedState(limited.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();

  let siteUrl: string;
  try {
    siteUrl = await getSiteUrl();
  } catch (error) {
    logAuthDiagnostic("signup_site_url", {
      name: error instanceof Error ? error.name : undefined,
    });
    return { error: PROVIDER_UNAVAILABLE_MESSAGE };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard`,
      data: {
        full_name: parsed.data.fullName,
        company_name: parsed.data.companyName,
        phone: parsed.data.phone,
        signup_mode: "owner",
      },
    },
  });

  if (error) {
    logAuthDiagnostic("signup", error);
    if (isAuthProviderUnavailable(error)) {
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
    return { error: GENERIC_SIGNUP_MESSAGE };
  }

  if (data.session) {
    const pending = await peekPendingInvite();

    if (pending.found) {
      revalidatePath("/", "layout");
      redirect("/convite");
    }

    const onboardingResult = await runCompleteOnboarding(
      parsed.data.fullName,
      parsed.data.companyName,
      parsed.data.phone,
    );

    if (!onboardingResult.ok) {
      if (onboardingResult.reason === "revoked") {
        revalidatePath("/", "layout");
        redirect("/dashboard/acesso-revogado");
      }
      return { error: onboardingResult.error };
    }

    revalidatePath("/", "layout");
    redirect(buildDashboardTrialStartedHref("/dashboard"));
  }

  redirect("/verifique-email");
}

async function signUpStaffAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = staffSignUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = await enforceAuthRateLimit("signup", parsed.data.email);
  if (limited) {
    return rateLimitedState(limited.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();

  let siteUrl: string;
  try {
    siteUrl = await getSiteUrl();
  } catch (error) {
    logAuthDiagnostic("signup_staff_site_url", {
      name: error instanceof Error ? error.name : undefined,
    });
    return { error: PROVIDER_UNAVAILABLE_MESSAGE };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/convite`,
      data: {
        full_name: parsed.data.fullName,
        signup_mode: "staff",
      },
    },
  });

  if (error) {
    logAuthDiagnostic("signup_staff", error);
    if (isAuthProviderUnavailable(error)) {
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
    return { error: GENERIC_SIGNUP_MESSAGE };
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/convite");
  }

  redirect("/verifique-email?modo=funcionario");
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = await enforceAuthRateLimit("login", parsed.data.email);
  if (limited) {
    return rateLimitedState(limited.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (isAuthProviderUnavailable(error)) {
      logAuthDiagnostic("login", error);
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
    return genericAuthError();
  }

  revalidatePath("/", "layout");
  redirect(await resolveAuthLandingPath());
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/entrar");
}

export async function passwordRecoveryAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido." };
  }

  const limited = await enforceAuthRateLimit("recovery", parsed.data.email);
  if (limited) {
    return rateLimitedState(limited.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();

  let siteUrl: string;
  try {
    siteUrl = await getSiteUrl();
  } catch (error) {
    logAuthDiagnostic("recovery_site_url", {
      name: error instanceof Error ? error.name : undefined,
    });
    return { error: PROVIDER_UNAVAILABLE_MESSAGE };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/nova-senha`,
  });

  if (error) {
    logAuthDiagnostic("recovery", error);
    if (isAuthProviderUnavailable(error)) {
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
  }

  return { success: GENERIC_RECOVERY_MESSAGE };
}

export async function resendConfirmationAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido." };
  }

  const limited = await enforceAuthRateLimit("resend", parsed.data.email);
  if (limited) {
    return rateLimitedState(limited.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();

  let siteUrl: string;
  try {
    siteUrl = await getSiteUrl();
  } catch (error) {
    logAuthDiagnostic("resend_site_url", {
      name: error instanceof Error ? error.name : undefined,
    });
    return { error: PROVIDER_UNAVAILABLE_MESSAGE };
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    logAuthDiagnostic("resend", error);
    if (isAuthProviderUnavailable(error)) {
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
  }

  return { success: GENERIC_RESEND_MESSAGE };
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return { error: SESSION_EXPIRED_MESSAGE };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logAuthDiagnostic("update_password", error);
    return {
      error: "Não foi possível atualizar a senha. Tente solicitar um novo link.",
    };
  }

  revalidatePath("/", "layout");
  redirect(
    getSafeRedirectPath(formData.get("redirectTo")?.toString(), "/entrar?senha-atualizada=1"),
  );
}

export async function completeOnboardingAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = onboardingSchema.safeParse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const onboardingResult = await runCompleteOnboarding(
    parsed.data.fullName,
    parsed.data.companyName,
    parsed.data.phone,
  );

  if (!onboardingResult.ok) {
    if (onboardingResult.reason === "revoked") {
      revalidatePath("/", "layout");
      redirect("/dashboard/acesso-revogado");
    }
    return { error: onboardingResult.error };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/onboarding", "layout");
  redirect(buildDashboardTrialStartedHref("/dashboard"));
}

export type OnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string; reason?: "revoked" | "session" | "generic" };

export async function runCompleteOnboarding(
  fullName: string,
  companyName: string,
  phone: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authenticated = Boolean(claimsData?.claims?.sub) && !claimsError;

  logOnboardingStep("auth", {
    ok: authenticated,
    code: claimsError?.code,
  });

  if (!authenticated || !claimsData?.claims?.sub) {
    return { ok: false, error: SESSION_EXPIRED_MESSAGE, reason: "session" };
  }

  const { data: companyId, error } = await supabase.rpc("complete_onboarding", {
    p_full_name: fullName,
    p_company_name: companyName,
    p_phone: phone,
  });

  logOnboardingStep("rpc", {
    ok: !error && typeof companyId === "string" && companyId.length > 0,
    code: error?.code,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("onboarding_access_revoked")) {
      return { ok: false, error: REVOKED_ACCESS_MESSAGE, reason: "revoked" };
    }
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE, reason: "generic" };
  }

  if (typeof companyId !== "string" || companyId.length === 0) {
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE, reason: "generic" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", claimsData.claims.sub)
    .eq("company_id", companyId)
    .is("access_revoked_at", null)
    .maybeSingle();

  logOnboardingStep("membership_verify", {
    ok: Boolean(membership) && !membershipError,
    code: membershipError?.code,
  });

  if (membershipError || !membership) {
    return {
      ok: false,
      error:
        "Conta criada, mas não foi possível confirmar o acesso à empresa. Tente novamente ou contate o suporte.",
      reason: "generic",
    };
  }

  return { ok: true, companyId };
}
