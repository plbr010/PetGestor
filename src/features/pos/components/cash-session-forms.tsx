"use client";

import { useActionState, useId } from "react";

import {
  closeCashSessionAction,
  openCashSessionAction,
  type PosActionState,
} from "@/features/pos/actions";
import type { OpenCashPreview } from "@/features/pos/cash-queries";
import type { CashMethodTotals } from "@/features/pos/balance";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatCentsToBRL } from "@/lib/money";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethod } from "@/types/database.types";

const initialState: PosActionState = {};

const METHOD_ORDER: PaymentMethod[] = [
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
];

function MethodBreakdown({ totals }: { totals: CashMethodTotals }) {
  return (
    <dl className="space-y-2 text-sm">
      {METHOD_ORDER.map((method) => (
        <div key={method} className="flex justify-between gap-3">
          <dt className={method === "cash" ? "font-medium" : "text-muted-foreground"}>
            {PAYMENT_METHOD_LABELS[method]}
            {method === "cash" ? " (físico)" : ""}
          </dt>
          <dd className={method === "cash" ? "font-medium" : undefined}>
            {formatCentsToBRL(totals[method])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function OpenCashSessionForm() {
  const openingId = useId();
  const notesId = useId();
  const [state, formAction, isPending] = useActionState(openCashSessionAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="font-medium">Abrir caixa</h3>
        <p className="text-sm text-muted-foreground">
          Informe o saldo inicial em dinheiro físico no gaveteiro.
        </p>
      </div>

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <div className="space-y-2">
        <Label htmlFor={openingId}>Saldo inicial (dinheiro) *</Label>
        <Input
          id={openingId}
          name="openingBalance"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue="0,00"
          required
          className="min-h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={notesId}>Observações</Label>
        <Textarea id={notesId} name="notes" rows={2} maxLength={500} />
      </div>

      <Button type="submit" className="min-h-11 w-full" disabled={isPending}>
        {isPending ? "Abrindo…" : "Abrir caixa"}
      </Button>
    </form>
  );
}

export function CloseCashSessionForm({ preview }: { preview: OpenCashPreview }) {
  const countedId = useId();
  const notesId = useId();
  const [state, formAction, isPending] = useActionState(closeCashSessionAction, initialState);
  const { session, methodTotals, expectedCashCents } = preview;
  const nonCashTotal =
    methodTotals.pix +
    methodTotals.debit_card +
    methodTotals.credit_card +
    methodTotals.bank_transfer +
    methodTotals.other;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 space-y-3">
        <div>
          <h3 className="font-medium">Resumo do período</h3>
          <p className="text-sm text-muted-foreground">
            Aberto em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(session.openedAt))}
          </p>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Saldo inicial (dinheiro)</span>
          <span className="font-medium">{formatCentsToBRL(session.openingBalanceCents)}</span>
        </div>

        <MethodBreakdown totals={methodTotals} />

        <div className="border-t pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">PIX / cartão / outros (resumo)</span>
            <span>{formatCentsToBRL(nonCashTotal)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Dinheiro físico esperado</span>
            <span>{formatCentsToBRL(expectedCashCents)}</span>
          </div>
        </div>
      </div>

      <form action={formAction} className="space-y-4 rounded-xl border p-4">
        <div>
          <h3 className="font-medium">Fechar caixa</h3>
          <p className="text-sm text-muted-foreground">
            Conte apenas o dinheiro físico. PIX e cartão entram no resumo, mas não no gaveteiro.
          </p>
        </div>

        {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
        {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

        <input type="hidden" name="sessionId" value={session.id} />

        <div className="space-y-2">
          <Label htmlFor={countedId}>Saldo contado (dinheiro) *</Label>
          <Input
            id={countedId}
            name="countedCash"
            inputMode="decimal"
            placeholder="0,00"
            required
            className="min-h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={notesId}>Observações</Label>
          <Textarea id={notesId} name="notes" rows={2} maxLength={500} />
        </div>

        <Button type="submit" className="min-h-11 w-full" disabled={isPending}>
          {isPending ? "Fechando…" : "Fechar caixa"}
        </Button>
      </form>
    </div>
  );
}
