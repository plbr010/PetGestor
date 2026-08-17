"use client";

import { useActionState } from "react";

import { sendWhatsAppAdminTestAction } from "@/features/notifications/admin-test-action";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

export function WhatsAppAdminTestForm() {
  const [state, formAction, isPending] = useActionState(
    sendWhatsAppAdminTestAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teste WhatsApp</CardTitle>
        <CardDescription>
          Envia o modelo “pet pronto” somente para o número de teste autorizado no servidor.
          Não é ferramenta de disparo e não usa dados de nenhum pet shop.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="phone">Número autorizado</Label>
            <Input id="phone" name="phone" placeholder="+55…" className="h-11" />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary" role="status">
              {state.success}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending} className="h-11">
            {isPending ? "Enviando…" : "Enviar teste"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
