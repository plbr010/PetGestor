"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  loginSchema,
  newPasswordSchema,
  onboardingSchema,
  passwordRecoverySchema,
  signUpSchema,
} from "@/features/auth/schemas";
import { getSiteUrl } from "@/lib/auth/get-site-url";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: string;
};

const ONBOARDING_ERROR_MESSAGE =
  "Não foi possível concluir a configuração inicial. Tente novamente em instantes.";

const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";

function genericAuthError(): AuthActionState {
  return { error: "E-mail ou senha incorretos." };
}

function mapSignUpError(message: string): AuthActionState {
  const normalized = message.toLowerCase();

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return {
      error:
        "Não foi possível concluir o cadastro. Verifique os dados ou tente entrar com sua conta.",
    };
  }

  return {
    error: "Não foi possível concluir o cadastro. Tente novamente em instantes.",
  };
}

function logOnboardingStep(
  step: string,
  details: { ok: boolean; code?: string; message?: string },
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[onboarding:${step}]`, details);
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
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
      },
    },
  });

  if (error) {
    return mapSignUpError(error.message);
  }

  if (data.session) {
    const onboardingResult = await runCompleteOnboarding(
      parsed.data.fullName,
      parsed.data.companyName,
    );

    if (!onboardingResult.ok) {
      return { error: onboardingResult.error };
    }

    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  redirect("/verifique-email");
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

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return genericAuthError();
  }

  revalidatePath("/", "layout");
  redirect(await resolvePostLoginPath());
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

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/nova-senha`,
  });

  return {
    success:
      "Se houver uma conta associada a esse e-mail, enviaremos as instruções.",
  };
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
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: "Não foi possível atualizar a senha. Tente solicitar um novo link.",
    };
  }

  revalidatePath("/", "layout");
  redirect(getSafeRedirectPath(formData.get("redirectTo")?.toString(), "/entrar?senha-atualizada=1"));
}

export async function completeOnboardingAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = onboardingSchema.safeParse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const onboardingResult = await runCompleteOnboarding(
    parsed.data.fullName,
    parsed.data.companyName,
  );

  if (!onboardingResult.ok) {
    return { error: onboardingResult.error };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/onboarding", "layout");
  redirect("/dashboard");
}

export type OnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

export async function runCompleteOnboarding(
  fullName: string,
  companyName: string,
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
  });

  logOnboardingStep("rpc", {
    ok: !error && typeof companyId === "string" && companyId.length > 0,
    code: error?.code,
    message: error?.message,
  });

  if (error) {
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE };
  }

  if (typeof companyId !== "string" || companyId.length === 0) {
    return { ok: false, error: ONBOARDING_ERROR_MESSAGE };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", claimsData.claims.sub)
    .limit(1)
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

async function resolvePostLoginPath(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    return "/entrar";
  }

  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", data.claims.sub)
    .limit(1)
    .maybeSingle();

  return membership ? "/dashboard" : "/onboarding";
}
