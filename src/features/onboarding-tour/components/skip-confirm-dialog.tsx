"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";

export function OnboardingSkipConfirmDialog() {
  const { showSkipConfirm, cancelSkip, confirmSkip, isPending } = useOnboardingTour();
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSkipConfirm) {
      return;
    }
    continueRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelSkip();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelSkip, showSkipConfirm]);

  if (!showSkipConfirm) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div
        className="absolute inset-0 bg-zinc-950/50"
        aria-hidden="true"
        onClick={cancelSkip}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-skip-title"
        aria-describedby="onboarding-skip-description"
        className="relative z-[81] w-full max-w-sm rounded-2xl border bg-background p-5 shadow-xl outline-none"
      >
        <h2 id="onboarding-skip-title" className="text-lg font-semibold tracking-tight">
          Deseja pular o tutorial guiado?
        </h2>
        <p id="onboarding-skip-description" className="mt-2 text-sm text-muted-foreground">
          Você poderá acessar novamente quando quiser. O checklist de primeiros passos continua no
          dashboard.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={confirmSkip}
            disabled={isPending}
          >
            Pular por enquanto
          </Button>
          <Button
            ref={continueRef}
            type="button"
            className="h-11"
            onClick={cancelSkip}
            disabled={isPending}
          >
            Continuar tutorial
          </Button>
        </div>
      </div>
    </div>
  );
}
