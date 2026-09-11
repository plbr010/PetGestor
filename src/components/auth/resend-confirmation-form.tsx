"use client";

import { useActionState } from "react";

import { resendConfirmationAction, type AuthActionState } from "@/features/auth/actions";
import { useDismissibleAuthFeedback } from "@/components/auth/use-dismissible-auth-feedback";
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
  const feedback = useDismissibleAuthFeedback(state);

  return (
    <form className="space-y-3" action={formAction} noValidate>
      {feedback.error ? <ErrorMessage message={feedback.error} /> : null}
      {feedback.success ? (
        <p className="text-sm text-foreground" role="status">
          {feedback.success}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="resend-email">Reenviar confirmação</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
          maxLength={254}
          onChange={feedback.clear}
        />
      </div>
      <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
        {isPending ? "Enviando..." : "Reenviar e-mail de confirmação"}
      </Button>
    </form>
  );
}
