import { buildDashboardTrialStartedHref } from "@/lib/analytics/meta-pixel";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

export function resolveAuthCallbackRedirect(input: {
  code: string | null;
  next: string | null;
  providerError: string | null;
  exchangeError: boolean;
}): { redirectTo: string } {
  if (input.providerError) {
    return { redirectTo: "/auth/erro?motivo=callback-falhou" };
  }

  if (!input.code) {
    return { redirectTo: "/auth/erro?motivo=callback-invalido" };
  }

  if (input.exchangeError) {
    return { redirectTo: "/auth/erro?motivo=callback-falhou" };
  }

  return { redirectTo: getSafeRedirectPath(input.next) };
}

export function resolveEmailConfirmLanding(input: {
  pendingInvite: boolean;
  signupMode: "staff" | "owner";
  onboardingOk: boolean;
  onboardingRevoked: boolean;
  next: string | null;
}): string {
  if (input.onboardingRevoked) {
    return "/dashboard/acesso-revogado";
  }

  if (input.pendingInvite || input.signupMode === "staff") {
    return "/convite";
  }

  if (input.onboardingOk) {
    return getSafeRedirectPath(input.next, buildDashboardTrialStartedHref("/dashboard"));
  }

  return "/onboarding";
}
