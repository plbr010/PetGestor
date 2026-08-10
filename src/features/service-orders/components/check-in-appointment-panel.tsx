"use client";

import { useActionState } from "react";

import {
  checkInAppointmentAction,
  type ServiceOrderActionState,
} from "@/features/service-orders/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CheckInAppointmentPanelProps = {
  appointmentId: string;
  existingServiceOrderId?: string | null;
};

export function CheckInAppointmentPanel({
  appointmentId,
  existingServiceOrderId,
}: CheckInAppointmentPanelProps) {
  const [state, formAction, isPending] = useActionState(
    checkInAppointmentAction.bind(null, appointmentId),
    {} as ServiceOrderActionState,
  );

  if (existingServiceOrderId) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Este agendamento já possui uma ordem de serviço.
        </p>
        <ButtonLink href={`/dashboard/atendimentos/${existingServiceOrderId}`} className="mt-3">
          Ver atendimento
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border p-4">
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      <div>
        <h3 className="font-medium">Receber pet</h3>
        <p className="text-sm text-muted-foreground">
          Registre a chegada do pet e inicie o fluxo operacional.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="intakeNotes">Observações de entrada (opcional)</Label>
        <Input
          id="intakeNotes"
          name="intakeNotes"
          placeholder="Ex.: Pet chegou com pequeno nó no pelo"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Registrando…" : "Pet chegou"}
      </Button>
    </form>
  );
}
