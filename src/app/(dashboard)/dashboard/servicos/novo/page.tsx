import { ServiceForm } from "@/features/services/components/service-form";
import { getProductPickerOptions } from "@/features/inventory/product-picker";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewServicePage() {
  const context = await requireCompanyContext();
  const products = await getProductPickerOptions(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Novo serviço" description="cadastro de serviço" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do serviço</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceForm
              mode="create"
              cancelHref="/dashboard/servicos"
              products={products}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
