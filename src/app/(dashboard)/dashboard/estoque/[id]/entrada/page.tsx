import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { StockEntryForm } from "@/features/inventory/components/stock-entry-form";
import { getActiveInventorySuppliers, requireActiveProductById } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EntryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StockEntryPage({ params }: EntryPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const today = getTodayInTimezone(context.membership.company.timezone);
  const [product, suppliers] = await Promise.all([
    requireActiveProductById(context.membership.company.id, id, today),
    getActiveInventorySuppliers(context.membership.company.id),
  ]);

  return (
    <>
      <DashboardHeader title="Registrar entrada" description={product.name} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="produtos" />
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Entrada de estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <StockEntryForm product={product} suppliers={suppliers} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
