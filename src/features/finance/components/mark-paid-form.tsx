"use client";

import { useActionState, useId, useState } from "react";

import {
  markFinancialEntryPaidAction,
  type FinanceActionState,
} from "@/features/finance/actions";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatAmountCents } from "@/features/finance/utils";
import type { FinancialEntryDetail } from "@/features/finance/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { PaymentMethod } from "@/types/database.types";

type MarkPaidFormProps = {
  entry: FinancialEntryDetail;
};

export function MarkPaidForm({ entry }: MarkPaidFormProps) {
  const remaining = entry.remaining_cents;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const amountId = useId();
  const [state, formAction, isPending] = useActionState(
    markFinancialEntryPaidAction.bind(null, entry.id),
    {} as FinanceActionState,
  );

  if (entry.status !== "pending" && entry.status !== "partially_paid") {
    return null;
  }

  if (remaining <= 0) {
    return null;
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Valor total</p>
          <p className="text-lg font-semibold">{formatAmountCents(entry.amount_cents)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Recebido</p>
          <p className="text-lg font-semibold">{formatAmountCents(entry.received_cents)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">A receber</p>
          <p className="text-2xl font-semibold">{formatAmountCents(remaining)}</p>
        </div>
      </div>

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className="space-y-2">
          <Label htmlFor="paymentMethod">Forma de pagamento *</Label>
          <Select id="paymentMethod" name="paymentMethod" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={amountId}>Valor deste pagamento</Label>
          <Input
            id={amountId}
            name="amount"
            defaultValue={(remaining / 100).toFixed(2).replace(".", ",")}
          />
          <p className="text-xs text-muted-foreground">
            Informe um valor menor para pagamento parcial. O padrão é o saldo a receber.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paidAt">Data/hora do pagamento (opcional)</Label>
          <Input id="paidAt" name="paidAt" type="datetime-local" />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Registrando…" : remaining < entry.amount_cents ? "Registrar pagamento" : "Confirmar pagamento"}
        </Button>
      </form>
    </div>
  );
}
