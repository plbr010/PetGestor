"use client";

import { useActionState } from "react";

import {
  resendConfirmationAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { AUTH_FIELD_LIMITS } from "@/features/auth/schemas";
import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export function ResendConfirmationForm() {
  const [state, formAction, isPending] = useActionState(
    resendConfirmationAction,
    initialState,
  );

  return (
    <form className="space-y-3" action={formAction} noValidate>
      {!isPending && state.error ? <ErrorMessage message={state.error} /> : null}
      {!isPending && state.success ? (
        <div
          className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground"
          role="status"
        >
          {state.success}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="resend-email">Reenviar confirmação</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          maxLength={AUTH_FIELD_LIMITS.email}
          required
        />
      </div>

      <Button type="submit" variant="outline" className="h-10 w-full" disabled={isPending}>
        {isPending ? "Enviando..." : "Reenviar e-mail de confirmação"}
      </Button>
    </form>
  );
}
