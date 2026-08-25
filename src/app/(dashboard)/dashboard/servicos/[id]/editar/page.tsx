import {
  updateServiceAction,
} from "@/features/services/actions";
import { ServiceForm } from "@/features/services/components/service-form";
import { getServiceRecipes } from "@/features/services/recipe-queries";
import { requireServiceById } from "@/features/services/queries";
import { getProductPickerOptions } from "@/features/inventory/product-picker";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditServicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditServicePage({ params }: EditServicePageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const companyId = context.membership.company.id;
  const [service, products, recipes] = await Promise.all([
    requireServiceById(companyId, id),
    getProductPickerOptions(companyId),
    getServiceRecipes(companyId, id),
  ]);

  const boundAction = updateServiceAction.bind(null, id);

  return (
    <>
      <DashboardHeader title={`Editar ${service.name}`} description="alteração de serviço" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do serviço</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceForm
              mode="edit"
              service={service}
              cancelHref={`/dashboard/servicos/${id}`}
              action={boundAction}
              products={products}
              recipes={recipes}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
