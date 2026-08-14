"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { completeOnboardingTutorialAction } from "@/features/onboarding-tour/actions";
import {
  getOnboardingTourStep,
  isLastOnboardingTourStep,
  ONBOARDING_TOUR_STEP_COUNT,
  shouldAutoStartOnboardingTour,
  type OnboardingTourStep,
} from "@/features/onboarding-tour/steps";

type OnboardingTourContextValue = {
  isOpen: boolean;
  stepIndex: number;
  step: OnboardingTourStep | null;
  stepCount: number;
  isLastStep: boolean;
  isPending: boolean;
  startTour: () => void;
  goNext: () => void;
  goPrev: () => void;
  skipTour: () => void;
  finishTour: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

type OnboardingTourProviderProps = {
  tutorialCompletedAt: string | null;
  children: ReactNode;
};

export function OnboardingTourProvider({
  tutorialCompletedAt,
  children,
}: OnboardingTourProviderProps) {
  const [isOpen, setIsOpen] = useState(() =>
    shouldAutoStartOnboardingTour(tutorialCompletedAt),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const persistCompletion = useCallback(() => {
    startTransition(async () => {
      await completeOnboardingTutorialAction();
    });
  }, []);

  const closeAndPersist = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    persistCompletion();
  }, [persistCompletion]);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const goNext = useCallback(() => {
    if (isLastOnboardingTourStep(stepIndex)) {
      closeAndPersist();
      return;
    }

    setStepIndex((current) => Math.min(current + 1, ONBOARDING_TOUR_STEP_COUNT - 1));
  }, [closeAndPersist, stepIndex]);

  const goPrev = useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const skipTour = useCallback(() => {
    closeAndPersist();
  }, [closeAndPersist]);

  const finishTour = useCallback(() => {
    closeAndPersist();
  }, [closeAndPersist]);

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      isOpen,
      stepIndex,
      step: getOnboardingTourStep(stepIndex),
      stepCount: ONBOARDING_TOUR_STEP_COUNT,
      isLastStep: isLastOnboardingTourStep(stepIndex),
      isPending,
      startTour,
      goNext,
      goPrev,
      skipTour,
      finishTour,
    }),
    [finishTour, goNext, goPrev, isOpen, isPending, skipTour, startTour, stepIndex],
  );

  return (
    <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const context = useContext(OnboardingTourContext);

  if (!context) {
    throw new Error("useOnboardingTour deve ser usado dentro de OnboardingTourProvider.");
  }

  return context;
}

/** Hook opcional para locais que podem estar fora do provider (ex.: admin). */
export function useOptionalOnboardingTour(): OnboardingTourContextValue | null {
  return useContext(OnboardingTourContext);
}
