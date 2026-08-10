"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelFinancialEntryAction,
  reopenFinancialEntryAction,
  updateManualFinancialEntryAction,
  type FinanceActionState,
} from "@/features/finance/actions";
import { FinancialEntryStatusBadge } from "@/features/finance/components/financial-entry-status-badge";
import { MarkPaidForm } from "@/features/finance/components/mark-paid-form";
import { isManualEntryEditable } from "@/features/finance/status";
import type { FinancialEntryDetail } from "@/features/finance/types";
import {
  formatAmountCents,
  formatDisplayDate,
  formatPaidAt,
  getPaymentMethodLabel,
  getSourceLabel,
  getTypeLabel,
} from "@/features/finance/utils";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FinanceDetailActionsProps = {
  entry: FinancialEntryDetail;
  timeZone: string;
};

export function FinanceDetailActions({ entry, timeZone }: FinanceDetailActionsProps) {
  const [updateState, updateAction, isUpdating] = useActionState(
    updateManualFinancialEntryAction.bind(null, entry.id),
    {} as FinanceActionState,
  );
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isReopening, startReopen] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  return (
    <div className="space-y-6">
      {message ? <FormFeedback message={message} variant="success" /> : null}
      {error ? <FormFeedback message={error} variant="error" /> : null}
      {updateState.success ? <FormFeedback message={updateState.success} variant="success" /> : null}
      {updateState.error ? <FormFeedback message={updateState.error} variant="error" /> : null}

      <div className="flex flex-wrap gap-2">
        <FinancialEntryStatusBadge status={entry.status} />
        {entry.service_order_id ? (
          <ButtonLink href={`/dashboard/atendimentos/${entry.service_order_id}`} variant="outline" size="sm">
            Ver atendimento
          </ButtonLink>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Tipo" value={getTypeLabel(entry.entry_type)} />
        <Item label="Origem" value={getSourceLabel(entry.source_type)} />
        <Item label="Valor" value={formatAmountCents(entry.amount_cents)} />
        <Item label="Vencimento" value={formatDisplayDate(entry.due_date)} />
        <Item
          label="Pagamento"
          value={
            entry.status === "paid"
              ? `${getPaymentMethodLabel(entry.payment_method)} · ${formatPaidAt(entry.paid_at, timeZone)}`
              : "—"
          }
        />
        <Item label="Categoria" value={entry.category ?? "—"} />
      </dl>

      {entry.notes ? (
        <div className="rounded-lg bg-muted/20 p-3 text-sm">
          <p className="text-muted-foreground">Observações</p>
          <p className="mt-1 whitespace-pre-wrap">{entry.notes}</p>
        </div>
      ) : null}

      {entry.status === "pending" ? <MarkPaidForm entry={entry} /> : null}

      {entry.status === "paid" ? (
        <Button
          type="button"
          variant="outline"
          disabled={isReopening}
          onClick={() => {
            startReopen(async () => {
              const result = await reopenFinancialEntryAction(entry.id);
              if (result.success) setMessage(result.success);
              if (result.error) setError(result.error);
            });
          }}
        >
          {isReopening ? "Reabrindo…" : "Reabrir como pendente"}
        </Button>
      ) : null}

      {isManualEntryEditable(entry.source_type) && entry.status === "pending" ? (
        <form action={updateAction} className="space-y-4 rounded-xl border p-4">
          <h3 className="font-medium">Editar lançamento manual</h3>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" defaultValue={entry.description} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Input id="category" name="category" defaultValue={entry.category ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor</Label>
              <Input
                id="amount"
                name="amount"
                defaultValue={(entry.amount_cents / 100).toFixed(2).replace(".", ",")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Vencimento</Label>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={entry.due_date ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" defaultValue={entry.notes ?? ""} rows={3} />
          </div>
          <Button type="submit" disabled={isUpdating}>
            {isUpdating ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>
      ) : null}

      {isManualEntryEditable(entry.source_type) && entry.status !== "cancelled" ? (
        <Button
          type="button"
          variant="destructive"
          disabled={isCancelling}
          onClick={() => {
            startCancel(async () => {
              const result = await cancelFinancialEntryAction(entry.id);
              if (result.success) setMessage(result.success);
              if (result.error) setError(result.error);
            });
          }}
        >
          {isCancelling ? "Cancelando…" : "Cancelar lançamento"}
        </Button>
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
