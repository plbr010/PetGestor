"use client";

import { useTransition } from "react";

import {
  cancelWaitlistEntryAction,
  markWaitlistContactedAction,
} from "@/features/appointments/waitlist/actions";
import type { WaitlistListItem } from "@/features/appointments/waitlist/types";
import {
  formatWaitlistPreference,
  formatWaitingDuration,
} from "@/features/appointments/waitlist/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WaitlistPanelProps = {
  entries: WaitlistListItem[];
  highlighted?: boolean;
  onConvert: (entry: WaitlistListItem) => void;
  onRefresh?: () => void;
};

const STATUS_LABELS: Record<WaitlistListItem["status"], string> = {
  waiting: "Aguardando",
  contacted: "Contatado",
  converted: "Convertido",
  cancelled: "Cancelado",
};

export function WaitlistPanel({
  entries,
  highlighted = false,
  onConvert,
  onRefresh,
}: WaitlistPanelProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className={highlighted ? "border-amber-300 dark:border-amber-900" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">Lista de espera</CardTitle>
        <CardDescription>
          Clientes aguardando vaga compatível ({entries.length})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente na lista de espera.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="space-y-3 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {entry.pet.name} · {entry.customer.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{entry.service.name}</p>
                  <p className="mt-1 text-sm">{formatWaitlistPreference(entry)}</p>
                  {entry.preferredEmployee ? (
                    <p className="text-sm text-muted-foreground">
                      Prefere: {entry.preferredEmployee.name}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatWaitingDuration(entry.created_at)}
                  </p>
                </div>
                <Badge variant="secondary">{STATUS_LABELS[entry.status]}</Badge>
              </div>

              {entry.notes ? (
                <p className="rounded-md bg-muted/30 p-2 text-sm whitespace-pre-wrap">
                  {entry.notes}
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  className="min-h-10"
                  onClick={() => onConvert(entry)}
                >
                  Criar agendamento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  disabled={isPending || entry.status === "contacted"}
                  onClick={() => {
                    startTransition(async () => {
                      await markWaitlistContactedAction(entry.id);
                      onRefresh?.();
                    });
                  }}
                >
                  Marcar contatado
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await cancelWaitlistEntryAction(entry.id);
                      onRefresh?.();
                    });
                  }}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
