import { FinanceDetailActions } from "@/features/finance/components/finance-detail-actions";
import { getPaymentsForEntry } from "@/features/finance/payments/queries";
import { requireFinancialEntryById } from "@/features/finance/queries";
import { formatAmountCents, formatDisplayDate, formatPaidAt } from "@/features/finance/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FinanceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinanceDetailPage({ params }: FinanceDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const timeZone = context.membership.company.timezone;
  const entry = await requireFinancialEntryById(context.membership.company.id, id);
  const payments = await getPaymentsForEntry(context.membership.company.id, id);

  return (
    <>
      <DashboardHeader title="Lançamento financeiro" description={entry.description} />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>{entry.description}</CardTitle>
          </CardHeader>
          <CardContent>
            <FinanceDetailActions entry={entry} payments={payments} timeZone={timeZone} />
          </CardContent>
        </Card>

        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailItem label="Valor" value={formatAmountCents(entry.amount_cents)} />
            <DetailItem label="Vencimento" value={formatDisplayDate(entry.due_date)} />
            <DetailItem
              label="Criado em"
              value={formatPaidAt(entry.created_at, timeZone)}
            />
            {entry.cancelled_at ? (
              <DetailItem
                label="Cancelado em"
                value={formatPaidAt(entry.cancelled_at, timeZone)}
              />
            ) : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
