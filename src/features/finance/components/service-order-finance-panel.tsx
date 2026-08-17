import { RecordPaymentForm } from "@/features/finance/components/record-payment-form";
import { FinancialEntryStatusBadge } from "@/features/finance/components/financial-entry-status-badge";
import type { FinancialEntryDetail } from "@/features/finance/types";
import { formatAmountCents } from "@/features/finance/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";

type ServiceOrderFinancePanelProps = {
  entry: FinancialEntryDetail | null;
  serviceOrderStatus: string;
  timeZone: string;
};

export function ServiceOrderFinancePanel({
  entry,
  serviceOrderStatus,
}: ServiceOrderFinancePanelProps) {
  if (!entry) {
    if (serviceOrderStatus === "waiting" || serviceOrderStatus === "in_progress") {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              A cobrança será gerada quando o atendimento for marcado como pronto.
            </p>
          </CardContent>
        </Card>
      );
    }

    return null;
  }

  const paidCents = entry.paid_cents ?? 0;
  const remainingCents = Math.max(entry.amount_cents - paidCents, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Financeiro</CardTitle>
        <FinancialEntryStatusBadge status={entry.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-lg font-semibold text-success">
              {formatAmountCents(entry.amount_cents)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pago</p>
            <p className="text-lg font-semibold">{formatAmountCents(paidCents)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Restante</p>
            <p className="text-lg font-semibold">{formatAmountCents(remainingCents)}</p>
          </div>
        </div>

        {(entry.status === "pending" || entry.status === "partially_paid") && remainingCents > 0 ? (
          <RecordPaymentForm entry={entry} />
        ) : null}

        <ButtonLink href={`/dashboard/financeiro/${entry.id}`} variant="outline" size="sm">
          Ver lançamento
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
