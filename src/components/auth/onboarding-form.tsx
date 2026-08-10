"use client";

import { useActionState } from "react";

import {
  completeOnboardingAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: AuthActionState = {};

type OnboardingFormProps = {
  defaultFullName?: string;
  defaultCompanyName?: string;
};

export function OnboardingForm({
  defaultFullName = "",
  defaultCompanyName = "",
}: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    completeOnboardingAction,
    initialState,
  );

  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center sm:text-left">
        <CardTitle className="text-2xl">Configure seu pet shop</CardTitle>
        <CardDescription>
          Confirme seus dados para concluir a configuração inicial da conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction} noValidate>
          {state.error ? <ErrorMessage message={state.error} /> : null}

          <div className="space-y-2">
            <Label htmlFor="fullName">Seu nome</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={defaultFullName}
              placeholder="Ex.: Ana Silva"
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Nome do pet shop</Label>
            <Input
              id="companyName"
              name="companyName"
              defaultValue={defaultCompanyName}
              placeholder="Ex.: Pet Shop Amigo Fiel"
              autoComplete="organization"
              required
            />
          </div>

          <Button type="submit" className="h-10 w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Concluir configuração"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
