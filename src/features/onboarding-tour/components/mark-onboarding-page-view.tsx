"use client";

import { useEffect, useRef } from "react";

import { useOptionalOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";

/** Marca a etapa educativa ao visitar a página (checklist), uma vez por montagem. */
export function MarkOnboardingPageView({ step }: { step: "workflow" | "finance" }) {
  const tour = useOptionalOnboardingTour();
  const fired = useRef(false);
  const workflowViewed = tour?.snapshot.workflowViewed ?? true;
  const financeViewed = tour?.snapshot.financeViewed ?? true;
  const markWorkflowViewed = tour?.markWorkflowViewed;
  const markFinanceViewed = tour?.markFinanceViewed;

  useEffect(() => {
    if (fired.current) {
      return;
    }
    if (step === "workflow" && !workflowViewed && markWorkflowViewed) {
      fired.current = true;
      markWorkflowViewed();
      return;
    }
    if (step === "finance" && !financeViewed && markFinanceViewed) {
      fired.current = true;
      markFinanceViewed();
    }
  }, [financeViewed, markFinanceViewed, markWorkflowViewed, step, workflowViewed]);

  return null;
}
