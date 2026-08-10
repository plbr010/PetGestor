"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelServiceOrderAction,
  completeServiceOrderAction,
  markServiceOrderReadyAction,
  startServiceOrderAction,
  type ServiceOrderActionState,
} from "@/features/service-orders/actions";
import { canTransitionServiceOrderStatus } from "@/features/service-orders/status";
import { formatAmountCents } from "@/features/finance/utils";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServiceOrderStatus } from "@/types/database.types";

type ServiceOrderActionsProps = {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  pendingPaymentAmountCents?: number | null;
};

export function ServiceOrderActions({
  serviceOrderId,
  status,
  pendingPaymentAmountCents,
}: ServiceOrderActionsProps) {
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [completeState, completeAction, isCompleting] = useActionState(
    completeServiceOrderAction.bind(null, serviceOrderId),
    {} as ServiceOrderActionState,
  );
  const [isStarting, startStart] = useTransition();
  const [isMarkingReady, startReady] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  async function runAction(action: () => Promise<ServiceOrderActionState>) {
    const result = await action();
    if (result.success) {
      setActionMessage(result.success);
      setActionError(undefined);
    } else if (result.error) {
      setActionError(result.error);
    }
  }

  function handleCompleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (
      pendingPaymentAmountCents &&
      pendingPaymentAmountCents > 0 &&
      !window.confirm(
        `Este atendimento ainda possui ${formatAmountCents(pendingPaymentAmountCents)} pendente. Deseja finalizar a entrega mesmo assim?`,
      )
    ) {
      event.preventDefault();
    }
  }

  if (status === "completed" || status === "cancelled") {
    return null;
  }

  return (
    <div className="space-y-4">
      {actionMessage ? <FormFeedback message={actionMessage} variant="success" /> : null}
      {actionError ? <FormFeedback message={actionError} variant="error" /> : null}
      {completeState.success ? <FormFeedback message={completeState.success} variant="success" /> : null}
      {completeState.error ? <FormFeedback message={completeState.error} variant="error" /> : null}

      <div className="flex flex-wrap gap-2">
        {canTransitionServiceOrderStatus(status, "in_progress") ? (
          <Button
            type="button"
            disabled={isStarting}
            onClick={() => {
              startStart(() => runAction(() => startServiceOrderAction(serviceOrderId)));
            }}
          >
            {isStarting ? "Iniciando…" : "Iniciar atendimento"}
          </Button>
        ) : null}

        {canTransitionServiceOrderStatus(status, "ready") ? (
          <Button
            type="button"
            disabled={isMarkingReady}
            onClick={() => {
              startReady(() => runAction(() => markServiceOrderReadyAction(serviceOrderId)));
            }}
          >
            {isMarkingReady ? "Salvando…" : "Marcar como pronto"}
          </Button>
        ) : null}
      </div>

      {canTransitionServiceOrderStatus(status, "completed") ? (
        <form
          action={completeAction}
          onSubmit={handleCompleteSubmit}
          className="space-y-3 rounded-xl border p-4"
        >
          <div>
            <h3 className="font-medium">Finalizar entrega</h3>
            <p className="text-sm text-muted-foreground">
              Confirme quando o tutor buscar o pet.
              {pendingPaymentAmountCents && pendingPaymentAmountCents > 0 ? (
                <>
                  {" "}
                  Pagamento pendente: {formatAmountCents(pendingPaymentAmountCents)}.
                </>
              ) : null}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="completionNotes">Observações de finalização (opcional)</Label>
            <Input
              id="completionNotes"
              name="completionNotes"
              placeholder="Ex.: Recomendada hidratação na próxima visita"
            />
          </div>
          <Button type="submit" disabled={isCompleting}>
            {isCompleting ? "Finalizando…" : "Finalizar entrega"}
          </Button>
        </form>
      ) : null}

      {canTransitionServiceOrderStatus(status, "cancelled") ? (
        <div className="rounded-xl border p-4">
          <h3 className="font-medium">Cancelar recebimento</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Disponível apenas enquanto o pet aguarda atendimento.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3"
            disabled={isCancelling}
            onClick={() => {
              startCancel(() => runAction(() => cancelServiceOrderAction(serviceOrderId)));
            }}
          >
            {isCancelling ? "Cancelando…" : "Cancelar atendimento"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
