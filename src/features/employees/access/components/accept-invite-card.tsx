"use client";

import { useActionState } from "react";

import {
  acceptPendingInviteAction,
  type AcceptInviteActionState,
} from "@/features/employees/access/accept-invite";
import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AcceptInviteCardProps = {
  companyName: string;
  expiresAt: string | null;
};

const INITIAL: AcceptInviteActionState = {};

export function AcceptInviteCard({ companyName, expiresAt }: AcceptInviteCardProps) {
  const [state, formAction, pending] = useActionState(acceptPendingInviteAction, INITIAL);

  const expiresLabel = expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(expiresAt))
    : null;

  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center sm:text-left">
        <CardTitle className="text-2xl">Você foi convidado</CardTitle>
        <CardDescription>
          Você foi convidado para fazer parte de{" "}
          <span className="font-medium text-foreground">{companyName || "um pet shop"}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.error ? <ErrorMessage message={state.error} /> : null}

        {expiresLabel ? (
          <p className="text-sm text-muted-foreground">Convite válido até {expiresLabel}.</p>
        ) : null}

        <form action={formAction}>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Aceitando..." : "Aceitar convite"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Ao aceitar, você entra na empresa existente. Nenhuma empresa nova será criada.
        </p>
      </CardContent>
    </Card>
  );
}
