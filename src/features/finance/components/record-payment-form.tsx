"use client";

import { useActionState, useId, useMemo } from "react";

import {
  recordFinancialPaymentAction,
  type FinanceActionState,
} from "@/features/finance/actions";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { centsToAmountInput } from "@/features/finance/payments/utils";
import { formatAmountCents } from "@/features/finance/utils";
import type { FinancialEntryDetail } from "@/features/finance/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethod } from "@/types/database.types";

type RecordPaymentFormProps = {
  entry: FinancialEntryDetail;
};

export function RecordPaymentForm({ entry }: RecordPaymentFormProps) {
  const idempotencyKey = useId();
  const paidCents = entry.paid_cents ?? 0;
  const remainingCents = Math.max(entry.amount_cents - paidCents, 0);

  const [state, formAction, isPending] = useActionState(
    recordFinancialPaymentAction.bind(null, entry.id),
    {} as FinanceActionState,
  );

  const defaultAmount = useMemo(() => centsToAmountInput(remainingCents), [remainingCents]);

  if (entry.status !== "pending" && entry.status !== "partially_paid") {
    return null;
  }

  if (remainingCents <= 0) {
    return null;
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-xl font-semibold">{formatAmountCents(entry.amount_cents)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Pago</p>
          <p className="text-xl font-semibold text-success">{formatAmountCents(paidCents)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Restante</p>
          <p className="text-xl font-semibold">{formatAmountCents(remainingCents)}</p>
        </div>
      </div>

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <div className="space-y-2">
          <Label htmlFor="amount">Valor *</Label>
          <Input id="amount" name="amount" required defaultValue={defaultAmount} />
        </div>

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
          <Label htmlFor="paidAt">Data/hora do pagamento (opcional)</Label>
          <Input id="paidAt" name="paidAt" type="datetime-local" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Observação (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Registrando…" : "Registrar pagamento"}
        </Button>
      </form>
    </div>
  );
}
