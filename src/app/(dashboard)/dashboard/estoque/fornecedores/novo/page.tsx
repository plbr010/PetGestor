import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { SupplierForm } from "@/features/inventory/components/supplier-form";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewSupplierPage() {
  await requireCompanyContext();

  return (
    <>
      <DashboardHeader title="Novo fornecedor" description="cadastro simples" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="fornecedores" />
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Dados do fornecedor</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierForm mode="create" cancelHref="/dashboard/estoque/fornecedores" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
