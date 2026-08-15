"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelAppointmentAction,
  confirmAppointmentAction,
  markNoShowAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import { isEditableStatus } from "@/features/appointments/status";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AppointmentStatus } from "@/types/database.types";

type AppointmentStatusActionsProps = {
  appointmentId: string;
  status: AppointmentStatus;
  isRecurring?: boolean;
};

export function AppointmentStatusActions({
  appointmentId,
  status,
  isRecurring = false,
}: AppointmentStatusActionsProps) {
  const [cancelState, cancelAction, isCancelling] = useActionState(
    cancelAppointmentAction.bind(null, appointmentId),
    {} as AppointmentActionState,
  );
  const [confirmMessage, setConfirmMessage] = useState<string | undefined>();
  const [noShowMessage, setNoShowMessage] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [noShowError, setNoShowError] = useState<string | undefined>();
  const [isConfirming, startConfirm] = useTransition();
  const [isMarkingNoShow, startNoShow] = useTransition();

  if (!isEditableStatus(status)) {
    return null;
  }

  return (
    <div className="space-y-4">
      {confirmMessage ? <FormFeedback message={confirmMessage} variant="success" /> : null}
      {noShowMessage ? <FormFeedback message={noShowMessage} variant="success" /> : null}
      {confirmError ? <FormFeedback message={confirmError} variant="error" /> : null}
      {noShowError ? <FormFeedback message={noShowError} variant="error" /> : null}
      {cancelState.success ? <FormFeedback message={cancelState.success} variant="success" /> : null}
      {cancelState.error ? <FormFeedback message={cancelState.error} variant="error" /> : null}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/dashboard/agenda/${appointmentId}/editar`} variant="outline">
          Editar
        </ButtonLink>

        {status === "scheduled" ? (
          <Button
            type="button"
            disabled={isConfirming}
            onClick={() => {
              startConfirm(async () => {
                const result = await confirmAppointmentAction(appointmentId);
                if (result.success) {
                  setConfirmMessage(result.success);
                  setConfirmError(undefined);
                } else if (result.error) {
                  setConfirmError(result.error);
                }
              });
            }}
          >
            {isConfirming ? "Confirmando…" : "Confirmar"}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          disabled={isMarkingNoShow}
          onClick={() => {
            startNoShow(async () => {
              const result = await markNoShowAction(appointmentId);
              if (result.success) {
                setNoShowMessage(result.success);
                setNoShowError(undefined);
              } else if (result.error) {
                setNoShowError(result.error);
              }
            });
          }}
        >
          {isMarkingNoShow ? "Salvando…" : "Não compareceu"}
        </Button>
      </div>

      <form action={cancelAction} className="space-y-3 rounded-xl border p-4">
        <div>
          <h3 className="font-medium">Cancelar agendamento</h3>
          <p className="text-sm text-muted-foreground">
            O horário será liberado na agenda. Esta ação não apaga o registro.
          </p>
        </div>
        {isRecurring ? (
          <div className="space-y-2">
            <Label htmlFor="seriesScope">Escopo do cancelamento</Label>
            <Select id="seriesScope" name="seriesScope" defaultValue="this">
              <option value="this">Somente este</option>
              <option value="this_and_following">Este e os próximos</option>
            </Select>
          </div>
        ) : (
          <input type="hidden" name="seriesScope" value="this" />
        )}
        <div className="space-y-2">
          <Label htmlFor="cancellationReason">Motivo (opcional)</Label>
          <Input
            id="cancellationReason"
            name="cancellationReason"
            placeholder="Ex.: Tutor solicitou remarcação"
          />
        </div>
        <Button type="submit" variant="destructive" disabled={isCancelling}>
          {isCancelling ? "Cancelando…" : "Cancelar agendamento"}
        </Button>
      </form>
    </div>
  );
}
