"use client";

import Link from "next/link";
import { MessageCircle, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOnboardingTour } from "@/features/onboarding-tour/onboarding-tour-provider";
import { cn } from "@/lib/utils";

const SUPPORT_WHATSAPP_URL =
  "https://wa.me/5532998064217?text=Ol%C3%A1%2C%20tenho%20uma%20d%C3%BAvida%20sobre%20o%20PetGestor.";

export function RestartOnboardingTourCard() {
  const { startTour, isOpen, isPending } = useOnboardingTour();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajuda</CardTitle>
        <CardDescription>
          Refaça o tutorial guiado ou fale com o suporte. Seus dados cadastrados não são apagados.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={startTour}
          disabled={isOpen || isPending}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Refazer tutorial do PetGestor
        </Button>
        <Link
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp sobre o PetGestor"
          className={cn(buttonVariants({ variant: "secondary" }), "h-11 w-full sm:w-auto")}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Falar no WhatsApp
        </Link>
      </CardContent>
    </Card>
  );
}
