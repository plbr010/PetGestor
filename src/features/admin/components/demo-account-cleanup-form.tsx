"use client";

import { useActionState } from "react";

import { DEMO_CLEANUP_CONFIRMATION_PHRASE } from "@/config/demo-accounts";
import { deleteDemoAccountsAction } from "@/features/admin/demo-account-cleanup-action";
import type { DemoAccountCandidate } from "@/features/admin/demo-account-cleanup";
import { formatAdminDateTime } from "@/features/admin/utils";
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

type DemoAccountCleanupFormProps = {
  candidates: DemoAccountCandidate[];
};

const initialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

export function DemoAccountCleanupForm({ candidates }: DemoAccountCleanupFormProps) {
  const [state, formAction, isPending] = useActionState(deleteDemoAccountsAction, initialState);

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Limpeza de contas demo</CardTitle>
        <CardDescription>
          Remove empresas e usuários criados para demonstração (ex.: screenshots de marketing).
          A ação é irreversível e exige confirmação explícita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta demo detectada pelos critérios atuais (nome &quot;Pet Shop Amigo
            Fiel&quot;, e-mails de teste ou IDs listados).
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Remover</th>
                    <th className="px-3 py-2 font-medium">Pet shop</th>
                    <th className="px-3 py-2 font-medium">Responsável</th>
                    <th className="px-3 py-2 font-medium">E-mail</th>
                    <th className="px-3 py-2 font-medium">Criada em</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.companyId} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          name="companyId"
                          value={candidate.companyId}
                          defaultChecked
                          className="size-4 rounded border"
                          aria-label={`Selecionar ${candidate.companyName}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{candidate.companyName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {candidate.ownerName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {candidate.ownerEmail ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatAdminDateTime(candidate.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{candidate.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-cleanup-confirmation">
                Confirmação ({DEMO_CLEANUP_CONFIRMATION_PHRASE})
              </Label>
              <Input
                id="demo-cleanup-confirmation"
                name="confirmation"
                placeholder={DEMO_CLEANUP_CONFIRMATION_PHRASE}
                className="h-11"
                autoComplete="off"
              />
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

            {state.result?.errors?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {state.result.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}

            <Button type="submit" variant="destructive" disabled={isPending} className="h-11">
              {isPending ? "Apagando…" : "Apagar contas demo selecionadas"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
