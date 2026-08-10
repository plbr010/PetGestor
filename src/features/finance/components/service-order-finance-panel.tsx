import { MarkPaidForm } from "@/features/finance/components/mark-paid-form";
import { FinancialEntryStatusBadge } from "@/features/finance/components/financial-entry-status-badge";
import type { FinancialEntryDetail } from "@/features/finance/types";
import {
  formatAmountCents,
  formatPaidAt,
  getPaymentMethodLabel,
} from "@/features/finance/utils";
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
  timeZone,
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Financeiro</CardTitle>
        <FinancialEntryStatusBadge status={entry.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {entry.status === "pending" ? "Valor a receber" : "Valor"}
          </p>
          <p className="text-2xl font-semibold text-success">
            {formatAmountCents(entry.amount_cents)}
          </p>
        </div>

        {entry.status === "paid" ? (
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Pago · </span>
              {getPaymentMethodLabel(entry.payment_method)}
            </p>
            <p className="text-muted-foreground">{formatPaidAt(entry.paid_at, timeZone)}</p>
          </div>
        ) : (
          <MarkPaidForm entry={entry} />
        )}

        <ButtonLink href={`/dashboard/financeiro/${entry.id}`} variant="outline" size="sm">
          Ver lançamento
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
