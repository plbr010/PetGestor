"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";

export function OnboardingWelcomeModal() {
  const { showWelcome, startConfiguration, exploreAlone, isPending } = useOnboardingTour();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showWelcome) {
      return;
    }
    primaryRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        exploreAlone();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [exploreAlone, showWelcome]);

  if (!showWelcome) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div
        className="absolute inset-0 bg-zinc-950/55 supports-backdrop-filter:backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={exploreAlone}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-welcome-title"
        aria-describedby="onboarding-welcome-description"
        className="relative z-[71] w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl outline-none sm:p-7"
      >
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Configuração estimada: 3–5 minutos
        </p>
        <h2 id="onboarding-welcome-title" className="mt-2 text-2xl font-semibold tracking-tight">
          Bem-vindo ao PetGestor 👋
        </h2>
        <p
          id="onboarding-welcome-description"
          className="mt-3 text-sm leading-relaxed text-muted-foreground"
        >
          Vamos preparar seu pet shop para começar a usar o sistema. Em poucos minutos você terá
          serviços, clientes e sua agenda pronta.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={exploreAlone}
            disabled={isPending}
          >
            Explorar sozinho
          </Button>
          <Button
            ref={primaryRef}
            type="button"
            className="h-11 w-full sm:w-auto"
            onClick={startConfiguration}
            disabled={isPending}
          >
            Começar configuração
          </Button>
        </div>
      </div>
    </div>
  );
}
