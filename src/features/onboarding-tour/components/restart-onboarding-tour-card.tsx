"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";

export function RestartOnboardingTourCard() {
  const { startTour, isOpen, isPending } = useOnboardingTour();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajuda</CardTitle>
        <CardDescription>
          Reveja o tour inicial para lembrar onde fica cada módulo do PetGestor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={startTour}
          disabled={isOpen || isPending}
        >
          Ver tutorial novamente
        </Button>
      </CardContent>
    </Card>
  );
}
