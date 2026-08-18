import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { SupplierForm } from "@/features/inventory/components/supplier-form";
import { requireInventorySupplierById } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditSupplierPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSupplierPage({ params }: EditSupplierPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const supplier = await requireInventorySupplierById(context.membership.company.id, id);

  return (
    <>
      <DashboardHeader title="Editar fornecedor" description={supplier.name} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="fornecedores" />
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Dados do fornecedor</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierForm
              mode="edit"
              supplier={supplier}
              cancelHref={`/dashboard/estoque/fornecedores/${id}`}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
