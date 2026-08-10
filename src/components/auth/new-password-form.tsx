"use client";

import { useActionState } from "react";
import Link from "next/link";

import { updatePasswordAction, type AuthActionState } from "@/features/auth/actions";
import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: AuthActionState = {};

type NewPasswordFormProps = {
  redirectTo?: string;
  embedded?: boolean;
};

function PasswordFields({
  state,
  formAction,
  isPending,
  redirectTo,
  showBackLink,
}: {
  state: AuthActionState;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  redirectTo?: string;
  showBackLink: boolean;
}) {
  return (
    <>
      <form className="space-y-4" action={formAction} noValidate>
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
        {state.error ? <ErrorMessage message={state.error} /> : null}

        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" className="h-10 w-full" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>

      {showBackLink ? (
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/entrar"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </p>
      ) : null}
    </>
  );
}

export function NewPasswordForm({ redirectTo, embedded = false }: NewPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, initialState);

  if (embedded) {
    return (
      <PasswordFields
        state={state}
        formAction={formAction}
        isPending={isPending}
        redirectTo={redirectTo}
        showBackLink={false}
      />
    );
  }

  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center sm:text-left">
        <CardTitle className="text-2xl">Definir nova senha</CardTitle>
        <CardDescription>Escolha uma senha segura com pelo menos 8 caracteres.</CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordFields
          state={state}
          formAction={formAction}
          isPending={isPending}
          redirectTo={redirectTo}
          showBackLink={false}
        />
      </CardContent>
      <CardFooter className="flex flex-col gap-4 border-t bg-muted/20 pt-6">
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/entrar"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
