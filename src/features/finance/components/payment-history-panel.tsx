"use client";

import { useTransition } from "react";

import { cancelFinancialPaymentAction } from "@/features/finance/actions";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import type { FinancialPaymentRecord } from "@/features/finance/payments/types";
import { formatAmountCents, formatPaidAt } from "@/features/finance/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/database.types";

type PaymentHistoryPanelProps = {
  entryId: string;
  payments: FinancialPaymentRecord[];
  timeZone: string;
};

export function PaymentHistoryPanel({ entryId, payments, timeZone }: PaymentHistoryPanelProps) {
  const [isPending, startTransition] = useTransition();

  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Histórico de pagamentos</h3>
      <ul className="space-y-3">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className={cn("rounded-xl border p-4", payment.cancelled_at && "opacity-70")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="font-semibold">{formatAmountCents(payment.amount_cents)}</p>
                <p className="text-sm text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[payment.payment_method as PaymentMethod]} ·{" "}
                  {formatPaidAt(payment.paid_at, timeZone)}
                  {payment.cancelled_at ? " · Estornado" : ""}
                </p>
                {payment.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{payment.notes}</p>
                ) : null}
              </div>
              {!payment.cancelled_at ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await cancelFinancialPaymentAction(payment.id, entryId);
                    });
                  }}
                >
                  Estornar
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
