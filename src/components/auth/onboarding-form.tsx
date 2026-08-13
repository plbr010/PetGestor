"use client";

import { useActionState, useState } from "react";

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
import { formatPhoneInput } from "@/lib/phone";

const initialState: AuthActionState = {};

type OnboardingFormProps = {
  defaultFullName?: string;
  defaultCompanyName?: string;
  defaultPhone?: string;
};

export function OnboardingForm({
  defaultFullName = "",
  defaultCompanyName = "",
  defaultPhone = "",
}: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    completeOnboardingAction,
    initialState,
  );
  const [phone, setPhone] = useState(defaultPhone ? formatPhoneInput(defaultPhone) : "");

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

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(32) 99999-9999"
              value={phone}
              onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
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
