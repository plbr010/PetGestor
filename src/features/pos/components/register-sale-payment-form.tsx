"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { registerSalePaymentAction, type PosActionState } from "@/features/pos/actions";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatCentsToBRL } from "@/lib/money";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PaymentMethod } from "@/types/database.types";

const initialState: PosActionState = {};

type RegisterSalePaymentFormProps = {
  saleId: string;
  remainingCents: number;
};

export function RegisterSalePaymentForm({
  saleId,
  remainingCents,
}: RegisterSalePaymentFormProps) {
  const amountId = useId();
  const methodId = useId();
  const paidAtId = useId();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isPending] = useActionState(
    registerSalePaymentAction.bind(null, saleId),
    initialState,
  );

  const remainingLabel = useMemo(() => formatCentsToBRL(remainingCents), [remainingCents]);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div>
        <h3 className="font-medium">Registrar pagamento</h3>
        <p className="text-sm text-muted-foreground">
          Saldo pendente: <span className="font-medium text-foreground">{remainingLabel}</span>
        </p>
      </div>

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="space-y-2">
        <Label htmlFor={amountId}>Valor *</Label>
        <Input
          id={amountId}
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          required
          className="min-h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={methodId}>Forma de pagamento *</Label>
        <Select id={methodId} name="paymentMethod" required defaultValue="" className="min-h-11">
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
        <Label htmlFor={paidAtId}>Data/hora (opcional)</Label>
        <Input id={paidAtId} name="paidAt" type="datetime-local" className="min-h-11" />
      </div>

      <Button type="submit" className="min-h-11 w-full" disabled={isPending || remainingCents <= 0}>
        {isPending ? "Registrando…" : "Confirmar pagamento"}
      </Button>
    </form>
  );
}
