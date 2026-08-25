"use client";

import { OnboardingCompletionModal } from "@/features/onboarding-tour/components/completion-modal";
import { OnboardingTourOverlay } from "@/features/onboarding-tour/components/onboarding-tour-overlay";
import { OnboardingSkipConfirmDialog } from "@/features/onboarding-tour/components/skip-confirm-dialog";
import { OnboardingSuccessToast } from "@/features/onboarding-tour/components/success-toast";
import { OnboardingWelcomeModal } from "@/features/onboarding-tour/components/welcome-modal";

/** Camada visual completa do onboarding (welcome, guia, skip, sucesso, toast). */
export function OnboardingExperienceLayer() {
  return (
    <>
      <OnboardingWelcomeModal />
      <OnboardingTourOverlay />
      <OnboardingSkipConfirmDialog />
      <OnboardingCompletionModal />
      <OnboardingSuccessToast />
    </>
  );
}
