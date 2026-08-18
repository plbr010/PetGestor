import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { ProductForm } from "@/features/inventory/components/product-form";
import { getProductCategories, requireActiveProductById } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const today = getTodayInTimezone(context.membership.company.timezone);
  const [product, categories] = await Promise.all([
    requireActiveProductById(context.membership.company.id, id, today),
    getProductCategories(context.membership.company.id, { includeArchived: true }),
  ]);

  return (
    <>
      <DashboardHeader title="Editar produto" description={product.name} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="produtos" />
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do produto</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm
              mode="edit"
              product={product}
              categories={categories.filter(
                (category) => !category.archived_at || category.id === product.categoryId,
              )}
              cancelHref={`/dashboard/estoque/${id}`}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
