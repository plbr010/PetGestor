"use client";

import { useActionState } from "react";

import { cancelSaleAction, type PosActionState } from "@/features/pos/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: PosActionState = {};

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const [state, formAction, isPending] = useActionState(
    cancelSaleAction.bind(null, saleId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-destructive/30 p-4">
      <div>
        <h3 className="font-medium text-destructive">Cancelar venda</h3>
        <p className="text-sm text-muted-foreground">
          O estoque será devolvido e o lançamento financeiro cancelado.
        </p>
      </div>

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <div className="space-y-2">
        <Label htmlFor="cancel-reason">Motivo *</Label>
        <Textarea id="cancel-reason" name="reason" rows={3} required minLength={3} />
      </div>

      <Button type="submit" variant="destructive" className="min-h-11 w-full" disabled={isPending}>
        {isPending ? "Cancelando..." : "Confirmar cancelamento"}
      </Button>
    </form>
  );
}
