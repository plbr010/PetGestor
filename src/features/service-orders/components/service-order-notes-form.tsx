"use client";

import { useActionState } from "react";

import {
  updateServiceOrderNotesAction,
  type ServiceOrderActionState,
} from "@/features/service-orders/actions";
import { isNotesEditableStatus } from "@/features/service-orders/status";
import type { ServiceOrderDetail } from "@/features/service-orders/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ServiceOrderNotesFormProps = {
  order: ServiceOrderDetail;
};

export function ServiceOrderNotesForm({ order }: ServiceOrderNotesFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateServiceOrderNotesAction.bind(null, order.id),
    {} as ServiceOrderActionState,
  );

  if (!isNotesEditableStatus(order.status)) {
    return null;
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <div className="space-y-2">
        <Label htmlFor="intakeNotes">Observações de entrada</Label>
        <Textarea
          id="intakeNotes"
          name="intakeNotes"
          defaultValue={order.intake_notes ?? ""}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="internalNotes">Observações internas</Label>
        <Textarea
          id="internalNotes"
          name="internalNotes"
          defaultValue={order.internal_notes ?? ""}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="completionNotes">Observações de finalização</Label>
        <Textarea
          id="completionNotes"
          name="completionNotes"
          defaultValue={order.completion_notes ?? ""}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando…" : "Salvar observações"}
      </Button>
    </form>
  );
}
