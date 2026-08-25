import {
  trackMetaCustomEvent,
} from "@/lib/analytics/meta-pixel";

export type OnboardingAnalyticsEvent =
  | "onboarding_started"
  | "onboarding_skipped"
  | "service_created"
  | "employee_created"
  | "customer_created"
  | "pet_created"
  | "first_appointment_created"
  | "workflow_viewed"
  | "finance_viewed"
  | "onboarding_completed";

/**
 * Eventos auxiliares de onboarding — nunca devem bloquear a UI.
 * Integra Meta Pixel quando disponível; silencioso caso contrário.
 */
export function trackOnboardingEvent(
  event: OnboardingAnalyticsEvent,
  params?: Record<string, unknown>,
): void {
  try {
    trackMetaCustomEvent(event, params);
  } catch {
    // Analytics nunca deve interromper o fluxo do usuário.
  }
}

/** Lista canônica para docs/testes. */
export const ONBOARDING_ANALYTICS_EVENTS: OnboardingAnalyticsEvent[] = [
  "onboarding_started",
  "onboarding_skipped",
  "service_created",
  "employee_created",
  "customer_created",
  "pet_created",
  "first_appointment_created",
  "workflow_viewed",
  "finance_viewed",
  "onboarding_completed",
];
