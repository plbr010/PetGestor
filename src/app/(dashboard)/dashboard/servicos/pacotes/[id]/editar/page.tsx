import { updateServicePackageAction } from "@/features/service-packages/actions";
import { ServicePackageForm } from "@/features/service-packages/components/service-package-form";
import { requireServicePackageById } from "@/features/service-packages/queries";
import { getActiveServices } from "@/features/services/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditPackagePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditServicePackagePage({ params }: EditPackagePageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const [pkg, services] = await Promise.all([
    requireServicePackageById(context.membership.company.id, id),
    getActiveServices(context.membership.company.id),
  ]);

  return (
    <>
      <DashboardHeader title="Editar pacote" description={pkg.name} />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do pacote</CardTitle>
          </CardHeader>
          <CardContent>
            <ServicePackageForm
              mode="edit"
              pkg={pkg}
              services={services.map((service) => ({ id: service.id, name: service.name }))}
              cancelHref={`/dashboard/servicos/pacotes/${id}`}
              action={updateServicePackageAction.bind(null, id)}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
