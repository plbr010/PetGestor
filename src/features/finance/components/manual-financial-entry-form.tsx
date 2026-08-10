"use client";

import { useActionState } from "react";

import {
  createManualExpenseAction,
  createManualIncomeAction,
  type FinanceActionState,
} from "@/features/finance/actions";
import {
  EXPENSE_CATEGORY_SUGGESTIONS,
  INCOME_CATEGORY_SUGGESTIONS,
  PAYMENT_METHOD_LABELS,
} from "@/features/finance/status";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FinancialEntryType, PaymentMethod } from "@/types/database.types";

const initialState: FinanceActionState = {};

type ManualFinancialEntryFormProps = {
  entryType: FinancialEntryType;
  cancelHref: string;
};

export function ManualFinancialEntryForm({
  entryType,
  cancelHref,
}: ManualFinancialEntryFormProps) {
  const action = entryType === "income" ? createManualIncomeAction : createManualExpenseAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const categories =
    entryType === "income" ? INCOME_CATEGORY_SUGGESTIONS : EXPENSE_CATEGORY_SUGGESTIONS;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="description">Descrição *</Label>
        <Input id="description" name="description" required placeholder="Ex.: Venda avulsa" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Categoria</Label>
        <Select id="category" name="category" defaultValue="">
          <option value="">Selecione ou deixe em branco</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Valor *</Label>
          <Input id="amount" name="amount" placeholder="0,00" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Vencimento</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue="pending">
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentMethod">Forma de pagamento (se pago)</Label>
          <Select id="paymentMethod" name="paymentMethod" defaultValue="">
            <option value="">Selecione se pago</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" name="notes" rows={4} />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar lançamento"}
        </Button>
      </div>
    </form>
  );
}
