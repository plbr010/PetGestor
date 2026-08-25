"use client";

import { useEffect } from "react";

import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";
import { cn } from "@/lib/utils";

export function OnboardingSuccessToast() {
  const { successToast, dismissSuccessToast } = useOnboardingTour();

  useEffect(() => {
    if (!successToast) {
      return;
    }
    const timer = window.setTimeout(() => dismissSuccessToast(), 4500);
    return () => window.clearTimeout(timer);
  }, [dismissSuccessToast, successToast]);

  if (!successToast) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed right-4 z-[75] w-[min(100%-2rem,22rem)] rounded-2xl border bg-background p-4 shadow-lg",
        "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
    >
      <p className="text-sm font-semibold tracking-tight">{successToast.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{successToast.description}</p>
      <button
        type="button"
        className="absolute top-2 right-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        onClick={dismissSuccessToast}
        aria-label="Fechar mensagem"
      >
        Fechar
      </button>
    </div>
  );
}
