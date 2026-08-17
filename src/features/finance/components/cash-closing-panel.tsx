"use client";

import { useActionState, useState, useTransition } from "react";

import {
  closeCashClosingAction,
  reopenCashClosingAction,
  type FinanceActionState,
} from "@/features/finance/actions";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import type { CashClosingRecord, DailyCashSummary } from "@/features/finance/payments/types";
import { computeCashDifference } from "@/features/finance/payments/utils";
import { formatAmountCents } from "@/features/finance/utils";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/database.types";

type CashClosingPanelProps = {
  businessDate: string;
  summary: DailyCashSummary;
  closing: CashClosingRecord | null;
  canReopen: boolean;
};

const methodKeys = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function CashClosingPanel({
  businessDate,
  summary,
  closing,
  canReopen,
}: CashClosingPanelProps) {
  const [closeState, closeAction, isClosing] = useActionState(
    closeCashClosingAction,
    {} as FinanceActionState,
  );
  const [reopenMessage, setReopenMessage] = useState<{
    text: string;
    variant: "success" | "error";
  } | null>(null);
  const [isReopening, startReopen] = useTransition();

  const isClosed = closing !== null && closing.closed_at !== null && !closing.reopened_at;

  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} />

      {isClosed && closing ? (
        <ClosedSnapshot closing={closing} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fechar caixa do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {closeState.error ? <FormFeedback message={closeState.error} variant="error" /> : null}
            {closeState.success ? (
              <FormFeedback message={closeState.success} variant="success" />
            ) : null}

            <form action={closeAction} className="space-y-4">
              <input type="hidden" name="businessDate" value={businessDate} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Saldo inicial em dinheiro</Label>
                  <Input id="openingBalance" name="openingBalance" defaultValue="0,00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualCash">Valor contado em caixa</Label>
                  <Input
                    id="actualCash"
                    name="actualCash"
                    placeholder={formatAmountCents(summary.expectedCashCents)}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Esperado em dinheiro: {formatAmountCents(summary.expectedCashCents)}
              </p>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={3} />
              </div>

              <Button type="submit" disabled={isClosing} className="w-full sm:w-auto">
                {isClosing ? "Fechando…" : "Registrar fechamento"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isClosed && closing && canReopen ? (
        <div className="space-y-2">
          {reopenMessage ? (
            <FormFeedback message={reopenMessage.text} variant={reopenMessage.variant} />
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={isReopening}
            onClick={() => {
              startReopen(async () => {
                const result = await reopenCashClosingAction(closing.id);
                if (result.success) {
                  setReopenMessage({ text: result.success, variant: "success" });
                }
                if (result.error) {
                  setReopenMessage({ text: result.error, variant: "error" });
                }
              });
            }}
          >
            {isReopening ? "Reabrindo…" : "Reabrir fechamento"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCards({ summary }: { summary: DailyCashSummary }) {
  const cards = [
    { label: "Total recebido", value: summary.totalReceivedCents, tone: "text-success" },
    ...methodKeys.map((method) => ({
      label: PAYMENT_METHOD_LABELS[method],
      value: summary.byMethod[method],
      tone: "text-foreground",
    })),
    { label: "Despesas pagas", value: summary.expensePaidCents, tone: "text-destructive" },
    { label: "Saldo do dia", value: summary.netBalanceCents, tone: "text-foreground" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-semibold", card.tone)}>
              {formatAmountCents(card.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClosedSnapshot({ closing }: { closing: CashClosingRecord }) {
  const difference =
    closing.difference_cents ??
    (closing.actual_cash_cents !== null && closing.expected_cash_cents !== null
      ? computeCashDifference(closing.expected_cash_cents, closing.actual_cash_cents)
      : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fechamento registrado</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <SnapshotItem label="Total recebido" value={formatAmountCents(closing.total_received_cents)} />
        <SnapshotItem label="Dinheiro" value={formatAmountCents(closing.cash_received_cents)} />
        <SnapshotItem label="PIX" value={formatAmountCents(closing.pix_received_cents)} />
        <SnapshotItem label="Despesas" value={formatAmountCents(closing.expense_paid_cents)} />
        <SnapshotItem label="Saldo do dia" value={formatAmountCents(closing.net_balance_cents)} />
        <SnapshotItem
          label="Esperado em dinheiro"
          value={formatAmountCents(closing.expected_cash_cents ?? 0)}
        />
        {closing.actual_cash_cents !== null ? (
          <SnapshotItem
            label="Contado em caixa"
            value={formatAmountCents(closing.actual_cash_cents)}
          />
        ) : null}
        {difference !== null ? (
          <SnapshotItem label="Diferença" value={formatAmountCents(difference)} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
