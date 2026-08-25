"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOptionalOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";
import type { OnboardingSnapshot } from "@/features/onboarding-tour/types";
import { cn } from "@/lib/utils";

type OnboardingChecklistCardProps = {
  snapshot: OnboardingSnapshot;
};

export function OnboardingChecklistCard({ snapshot }: OnboardingChecklistCardProps) {
  const tour = useOptionalOnboardingTour();
  const live = tour?.snapshot ?? snapshot;
  const show = live.showChecklist && !live.isFullyComplete;
  const allDone = live.completedCount >= live.totalCount && live.totalCount > 0;

  if (!show) {
    return null;
  }

  if (allDone) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Configuração concluída 🎉</CardTitle>
          <CardDescription>
            Seu pet shop já tem o essencial para começar a operar no PetGestor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => tour?.dismissChecklist()}
            disabled={tour?.isPending}
          >
            Ocultar card
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Configure seu PetGestor</CardTitle>
            <CardDescription className="mt-1">
              Complete os primeiros passos para aproveitar melhor o sistema.
            </CardDescription>
          </div>
          <p className="text-sm font-medium text-muted-foreground tabular-nums">
            {live.completedCount} de {live.totalCount} concluídos
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={live.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso dos primeiros passos"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${live.percent}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5" aria-label="Primeiros passos">
          {live.checklist.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.completed && "text-muted-foreground",
                )}
              >
                {item.completed ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Concluído</span>
                  </span>
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                    <Circle className="size-4" aria-hidden="true" />
                    <span className="sr-only">Pendente</span>
                  </span>
                )}
                <span className={cn(item.completed && "line-through decoration-muted-foreground/50")}>
                  {item.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {tour && !tour.isOpen && !live.guidedActive ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full sm:w-auto"
              onClick={() => tour.startTour()}
              disabled={tour.isPending}
            >
              Continuar tutorial guiado
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
