import { ManualFinancialEntryForm } from "@/features/finance/components/manual-financial-entry-form";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NovaDespesaPage() {
  return (
    <>
      <DashboardHeader title="Nova despesa" description="lançamento manual" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Despesa manual</CardTitle>
          </CardHeader>
          <CardContent>
            <ManualFinancialEntryForm entryType="expense" cancelHref="/dashboard/financeiro" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
