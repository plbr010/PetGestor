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
import {
  RECOVERY_INVALID_MESSAGE,
  RecoverySecretConfigError,
  buildRecoveryCallbackPath,
  clearRecoveryMarkerCookie,
  consumeRecoveryMarkerForUser,
  createRecoveryTicket,
  resolveRecoverySecret,
} from "@/lib/auth/recovery-marker";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { buildDashboardTrialStartedHref } from "@/lib/analytics/meta-pixel";
import { AppUrlConfigError } from "@/lib/env/resolve-app-url";
import { enforceAuthRateLimit } from "@/lib/security/rate-limit";
import { logAuthEvent } from "@/lib/security/safe-log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstIssueMessage } from "@/lib/validation/first-issue-message";
import {
  GENERIC_SIGNUP_MESSAGE,
  PROVIDER_UNAVAILABLE_MESSAGE,
  RECOVERY_GENERIC_MESSAGE,
  RESEND_GENERIC_MESSAGE,
} from "@/features/auth/messages";
import { isAntiEnumerationAuthError } from "@/features/auth/provider-errors";

export type AuthActionState = {
  error?: string;
  success?: string;
  retryAfterSeconds?: number;
};

const ONBOARDING_ERROR_MESSAGE =
  "Não foi possível concluir a configuração inicial. Tente novamente em instantes.";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";

const MEMBERSHIP_REVOKED_MESSAGE =
  "Seu acesso à empresa foi removido. Entre em contato com o administrador.";

function genericAuthError(): AuthActionState {
  return { error: "E-mail ou senha incorretos." };
}

function rateLimitState(
  result: Extract<Awaited<ReturnType<typeof enforceAuthRateLimit>>, { ok: false }>,
): AuthActionState {
  return { error: result.error, retryAfterSeconds: result.retryAfterSeconds };
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
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const limited = await enforceAuthRateLimit({
    action: "signup",
    email: parsed.data.email,
  });
  if (!limited.ok) {
    return rateLimitState(limited);
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

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
    logAuthEvent("SignUp", {
      status: error.status ?? null,
      code: "code" in error ? error.code : null,
      name: error.name ?? null,
    });
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
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const limited = await enforceAuthRateLimit({
    action: "signup",
    email: parsed.data.email,
  });
  if (!limited.ok) {
    return rateLimitState(limited);
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

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
    logAuthEvent("SignUpStaff", {
      status: error.status ?? null,
      code: "code" in error ? error.code : null,
    });
    return { error: GENERIC_SIGNUP_MESSAGE };
  }

  if (data.session) {
    const pending = await peekPendingInvite();

    if (!pending.found) {
      return {
        error:
          "Não encontramos um convite pendente para este e-mail. Confira com o administrador ou peça um novo convite.",
      };
    }

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
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const limited = await enforceAuthRateLimit({
    action: "login",
    email: parsed.data.email,
  });
  if (!limited.ok) {
    return rateLimitState(limited);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
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
    return { error: firstIssueMessage(parsed.error.issues, "Informe um e-mail válido.") };
  }

  const limited = await enforceAuthRateLimit({
    action: "recovery",
    email: parsed.data.email,
  });
  if (!limited.ok) {
    return rateLimitState(limited);
  }

  try {
    const secret = resolveRecoverySecret();
    const supabase = await createSupabaseServerClient();
    const siteUrl = await getSiteUrl();

    const ticket = createRecoveryTicket(secret);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${siteUrl}${buildRecoveryCallbackPath(ticket)}`,
    });

    if (error) {
      logAuthEvent("Recovery", {
        status: error.status ?? null,
        code: "code" in error ? error.code : null,
      });
      if (isAntiEnumerationAuthError(error)) {
        return { success: RECOVERY_GENERIC_MESSAGE };
      }
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
  } catch (error) {
    if (error instanceof RecoverySecretConfigError) {
      logAuthEvent("Recovery", { code: "recovery_secret_unconfigured" });
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }

    if (error instanceof AppUrlConfigError) {
      logAuthEvent("Recovery", { code: "app_url_unconfigured" });
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }

    throw error;
  }

  return { success: RECOVERY_GENERIC_MESSAGE };
}

export async function resendConfirmationAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error.issues, "Informe um e-mail válido.") };
  }

  const limited = await enforceAuthRateLimit({
    action: "resend_confirmation",
    email: parsed.data.email,
  });
  if (!limited.ok) {
    return rateLimitState(limited);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const siteUrl = await getSiteUrl();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard`,
      },
    });

    if (error) {
      logAuthEvent("ResendConfirmation", {
        status: error.status ?? null,
        code: "code" in error ? error.code : null,
      });
      if (isAntiEnumerationAuthError(error)) {
        return { success: RESEND_GENERIC_MESSAGE };
      }
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }
  } catch (error) {
    if (error instanceof AppUrlConfigError) {
      logAuthEvent("ResendConfirmation", { code: "app_url_unconfigured" });
      return { error: PROVIDER_UNAVAILABLE_MESSAGE };
    }

    throw error;
  }

  return { success: RESEND_GENERIC_MESSAGE };
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
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      error: "Sua sessão expirou. Solicite um novo link de recuperação ou entre novamente.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logAuthEvent("UpdatePassword", {
      status: error.status ?? null,
      code: "code" in error ? error.code : null,
    });
    return {
      error: "Não foi possível atualizar a senha. Tente solicitar um novo link.",
    };
  }

  revalidatePath("/", "layout");
  redirect(getSafeRedirectPath(formData.get("redirectTo")?.toString(), "/entrar?senha-atualizada=1"));
}

export async function updateRecoveryPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return { error: RECOVERY_INVALID_MESSAGE };
  }

  const consumed = await consumeRecoveryMarkerForUser(claimsData.claims.sub);
  if (!consumed) {
    return { error: RECOVERY_INVALID_MESSAGE };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logAuthEvent("UpdateRecoveryPassword", {
      status: error.status ?? null,
      code: "code" in error ? error.code : null,
    });
    return { error: RECOVERY_INVALID_MESSAGE };
  }

  await clearRecoveryMarkerCookie();
  revalidatePath("/", "layout");
  redirect("/entrar?senha-atualizada=1");
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
    return { error: firstIssueMessage(parsed.error.issues) };
  }

  const onboardingResult = await runCompleteOnboarding(
    parsed.data.fullName,
    parsed.data.companyName,
    parsed.data.phone,
  );

  if (!onboardingResult.ok) {
    return { error: onboardingResult.error };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/onboarding", "layout");
  redirect(buildDashboardTrialStartedHref("/dashboard"));
}

export type OnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

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
    message: claimsError?.message,
  });

  if (!authenticated || !claimsData?.claims?.sub) {
    return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  }

  const { data: companyId, error } = await supabase.rpc("complete_onboarding", {
    p_full_name: fullName,
    p_company_name: companyName,
    p_phone: phone,
  });

  logOnboardingStep("rpc", {
    ok: !error && typeof companyId === "string" && companyId.length > 0,
    code: error?.code,
    message: error?.message,
  });

  if (error) {
    if (error.message?.includes("membership_revoked")) {
      return { ok: false, error: MEMBERSHIP_REVOKED_MESSAGE };
    }
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE };
  }

  if (typeof companyId !== "string" || companyId.length === 0) {
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE };
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
    message: membershipError?.message,
  });

  if (membershipError || !membership) {
    return {
      ok: false,
      error:
        "Conta criada, mas não foi possível confirmar o acesso à empresa. Tente novamente ou contate o suporte.",
    };
  }

  return { ok: true, companyId };
}
