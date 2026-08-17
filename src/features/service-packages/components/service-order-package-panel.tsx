"use client";

import { useState, useTransition } from "react";

import {
  consumePackageCreditAction,
  reversePackageUsageAction,
  type ServicePackageActionState,
} from "@/features/service-packages/actions";
import type { PackageCreditOption } from "@/features/service-packages/types";
import { formatDateDisplay } from "@/lib/pet-display";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ServiceOrderStatus } from "@/types/database.types";

type ServiceOrderPackagePanelProps = {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  credits: PackageCreditOption[];
  hasConsumedUsage: boolean;
};

export function ServiceOrderPackagePanel({
  serviceOrderId,
  status,
  credits,
  hasConsumedUsage,
}: ServiceOrderPackagePanelProps) {
  const [message, setMessage] = useState<ServicePackageActionState>({});
  const [isPending, startTransition] = useTransition();

  const canUse =
    (status === "waiting" || status === "in_progress") && !hasConsumedUsage && credits.length > 0;
  const canReverse =
    (status === "waiting" || status === "in_progress" || status === "ready") && hasConsumedUsage;

  if (!canUse && !canReverse && !hasConsumedUsage) {
    return null;
  }

  function handleUse(customerPackageId: string) {
    startTransition(async () => {
      const result = await consumePackageCreditAction(serviceOrderId, customerPackageId);
      setMessage(result);
    });
  }

  function handleReverse() {
    if (!window.confirm("Estornar o uso do pacote e restaurar o saldo?")) {
      return;
    }

    startTransition(async () => {
      const result = await reversePackageUsageAction(serviceOrderId);
      setMessage(result);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pacote de serviços</CardTitle>
        <CardDescription>
          Utilize saldo já pago ou estorne em caso de consumo incorreto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message.success ? <FormFeedback message={message.success} variant="success" /> : null}
        {message.error ? <FormFeedback message={message.error} variant="error" /> : null}

        {hasConsumedUsage ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            Este atendimento está coberto por pacote. Nenhuma cobrança avulsa será gerada.
          </div>
        ) : null}

        {canUse ? (
          <div className="space-y-3">
            {credits.map((credit) => (
              <div
                key={credit.customerPackageId}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium">{credit.packageName}</p>
                  <p className="text-muted-foreground">
                    {credit.serviceName} · saldo: {credit.remaining} · válido até{" "}
                    {formatDateDisplay(credit.expiresAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleUse(credit.customerPackageId)}
                  className="w-full sm:w-auto"
                >
                  {isPending ? "Processando…" : "Usar pacote"}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {canReverse ? (
          <Button type="button" variant="outline" disabled={isPending} onClick={handleReverse}>
            {isPending ? "Estornando…" : "Estornar pacote"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
