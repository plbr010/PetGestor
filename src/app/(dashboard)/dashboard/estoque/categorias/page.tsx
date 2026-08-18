import { CategoryManager } from "@/features/inventory/components/category-manager";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import {
  ensureDefaultProductCategories,
  getProductCategories,
} from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductCategoriesPage() {
  const context = await requireCompanyContext();
  await ensureDefaultProductCategories(
    context.membership.company.id,
    context.user.id,
  );
  const categories = await getProductCategories(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Categorias" description="organização dos produtos" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="categorias" />
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Categorias da empresa</CardTitle>
            <CardDescription>
              Crie, edite ou arquive. Categorias sugeridas são criadas na primeira visita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager categories={categories} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
