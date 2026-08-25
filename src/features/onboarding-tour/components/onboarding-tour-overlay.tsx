"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";
import { cn } from "@/lib/utils";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readTargetRect(targetId: string | null | undefined): SpotlightRect | null {
  if (!targetId || typeof document === "undefined") {
    return null;
  }

  const desktop = window.matchMedia("(min-width: 1024px)").matches;
  const selectors = desktop
    ? [
        `[data-tour-id="${targetId}"][data-tour-scope="desktop"]`,
        `[data-tour-id="${targetId}"]`,
      ]
    : [
        `[data-tour-id="${targetId}"][data-tour-scope="mobile"]`,
        `[data-tour-id="${targetId}"]`,
      ];

  let el: HTMLElement | null = null;
  for (const selector of selectors) {
    el = document.querySelector<HTMLElement>(selector);
    if (el) {
      break;
    }
  }

  if (!el) {
    return null;
  }

  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });

  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return null;
  }

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Mantém nome legado usado pelos testes de superfície. */
export function readDesktopTargetRect(targetId: string | null | undefined): SpotlightRect | null {
  if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
    return null;
  }
  return readTargetRect(targetId);
}

export function OnboardingTourOverlay() {
  const {
    isOpen,
    step,
    stepIndex,
    stepCount,
    isLastStep,
    isPending,
    goNext,
    goPrev,
    skipTour,
    finishTour,
    markWorkflowViewed,
  } = useOnboardingTour();

  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    function update() {
      if (cancelled) {
        return;
      }
      setSpotlight(readTargetRect(step?.targetId));
    }

    const frame = window.requestAnimationFrame(update);
    const timer = window.setTimeout(update, 160);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen, step?.targetId, stepIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    primaryButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        skipTour();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, skipTour, stepIndex]);

  useEffect(() => {
    if (!isOpen || step?.id !== "workflow") {
      return;
    }
    const timer = window.setTimeout(() => {
      markWorkflowViewed();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, markWorkflowViewed, step?.id]);

  if (!isOpen || !step) {
    return null;
  }

  const progressLabel = `${stepIndex + 1} de ${stepCount}`;
  const visibleSpotlight = step.targetId ? spotlight : null;
  const cardPlacement =
    visibleSpotlight && visibleSpotlight.top < window.innerHeight * 0.45
      ? "bottom"
      : "top";

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" role="presentation">
      <div
        className="pointer-events-auto absolute inset-0 bg-zinc-950/40 supports-backdrop-filter:backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={skipTour}
      />

      {visibleSpotlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[61] rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-200"
          style={{
            top: Math.max(visibleSpotlight.top - 4, 8),
            left: Math.min(
              Math.max(visibleSpotlight.left - 4, 8),
              window.innerWidth - visibleSpotlight.width - 16,
            ),
            width: Math.min(visibleSpotlight.width + 8, window.innerWidth - 16),
            height: visibleSpotlight.height + 8,
            boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.4)",
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-description"
        tabIndex={-1}
        className={cn(
          "pointer-events-auto absolute inset-x-3 z-[62] outline-none sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2",
          cardPlacement === "bottom"
            ? "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-8"
            : "top-[max(1rem,env(safe-area-inset-top))] sm:top-8",
        )}
      >
        <div className="rounded-2xl border bg-background p-5 shadow-xl sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tutorial · {progressLabel}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-muted-foreground"
              onClick={skipTour}
              disabled={isPending}
              aria-label="Pular tutorial"
            >
              Pular tutorial
            </Button>
          </div>

          <h2 id="onboarding-tour-title" className="text-xl font-semibold tracking-tight">
            {step.title}
          </h2>
          <p
            id="onboarding-tour-description"
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
          >
            {step.description}
          </p>

          {step.hints && step.hints.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Exemplos: {step.hints.join(" · ")}
            </p>
          ) : null}

          {step.id === "workflow" ? (
            <ol className="mt-4 space-y-2 text-sm">
              <li>
                <span className="font-medium">Check-in</span>
                <span className="text-muted-foreground"> — quando o pet chegar.</span>
              </li>
              <li>
                <span className="font-medium">Em atendimento</span>
                <span className="text-muted-foreground"> — quando o serviço começar.</span>
              </li>
              <li>
                <span className="font-medium">Pronto</span>
                <span className="text-muted-foreground"> — quando o atendimento terminar.</span>
              </li>
              <li>
                <span className="font-medium">Entregue</span>
                <span className="text-muted-foreground"> — finalize ao entregar ao tutor.</span>
              </li>
            </ol>
          ) : null}

          {step.id === "finance" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Destaques: receitas · despesas · pagamentos · realizado · projetado
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: stepCount }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  index <= stepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={goPrev}
              disabled={stepIndex === 0 || isPending}
            >
              Voltar
            </Button>

            {isLastStep ? (
              <Button
                ref={primaryButtonRef}
                type="button"
                className="h-11 w-full sm:min-w-48 sm:w-auto"
                onClick={finishTour}
                disabled={isPending}
              >
                Concluir
              </Button>
            ) : (
              <Button
                ref={primaryButtonRef}
                type="button"
                className="h-11 w-full sm:w-auto"
                onClick={goNext}
                disabled={isPending}
              >
                Próximo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
