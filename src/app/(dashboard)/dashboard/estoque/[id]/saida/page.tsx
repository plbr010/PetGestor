import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { StockExitForm } from "@/features/inventory/components/stock-exit-form";
import { requireActiveProductById } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ExitPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StockExitPage({ params }: ExitPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const today = getTodayInTimezone(context.membership.company.timezone);
  const product = await requireActiveProductById(context.membership.company.id, id, today);

  return (
    <>
      <DashboardHeader title="Registrar saída" description={product.name} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="produtos" />
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Saída manual</CardTitle>
          </CardHeader>
          <CardContent>
            <StockExitForm product={product} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
