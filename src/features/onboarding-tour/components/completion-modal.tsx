"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";

const SUMMARY_ITEMS = [
  "Serviço cadastrado",
  "Funcionário adicionado",
  "Cliente e pet cadastrados",
  "Primeiro agendamento criado",
  "Fluxo de atendimento apresentado",
] as const;

export function OnboardingCompletionModal() {
  const { showCompletion, dismissCompletion, isPending, snapshot } = useOnboardingTour();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showCompletion) {
      return;
    }
    primaryRef.current?.focus();
  }, [showCompletion]);

  if (!showCompletion) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-zinc-950/55 supports-backdrop-filter:backdrop-blur-[1px]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-complete-title"
        aria-describedby="onboarding-complete-description"
        className="relative z-[71] w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl outline-none sm:p-7"
      >
        <h2 id="onboarding-complete-title" className="text-2xl font-semibold tracking-tight">
          Tudo pronto! 🎉
        </h2>
        <p
          id="onboarding-complete-description"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          Seu PetGestor já está configurado para começar a organizar seu pet shop.
        </p>

        <ul className="mt-5 space-y-2" aria-label="Resumo da configuração">
          {SUMMARY_ITEMS.map((label, index) => {
            const done = snapshot.checklist[index]?.completed ?? true;
            return (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    done
                      ? "flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary"
                      : "flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  }
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-sm text-muted-foreground">
          Agora é só continuar adicionando seus clientes e agendamentos. O PetGestor cuida da
          organização para você.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => dismissCompletion("agenda")}
            disabled={isPending}
          >
            Ver minha agenda
          </Button>
          <Button
            ref={primaryRef}
            type="button"
            className="h-11 w-full sm:w-auto"
            onClick={() => dismissCompletion("dashboard")}
            disabled={isPending}
          >
            Ir para o Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
