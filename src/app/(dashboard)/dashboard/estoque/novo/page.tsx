import { ProductForm } from "@/features/inventory/components/product-form";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import {
  ensureDefaultProductCategories,
  getProductCategories,
} from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewProductPage() {
  const context = await requireCompanyContext();
  await ensureDefaultProductCategories(
    context.membership.company.id,
    context.user.id,
  );
  const categories = await getProductCategories(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Novo produto" description="cadastro de estoque" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="produtos" />
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do produto</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm mode="create" categories={categories} cancelHref="/dashboard/estoque" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
