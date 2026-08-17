import { ServicePackageForm } from "@/features/service-packages/components/service-package-form";
import { getActiveServices } from "@/features/services/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewServicePackagePage() {
  const context = await requireCompanyContext();
  const services = await getActiveServices(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Novo pacote" description="cadastro de pacote de serviços" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do pacote</CardTitle>
          </CardHeader>
          <CardContent>
            <ServicePackageForm
              mode="create"
              services={services.map((service) => ({ id: service.id, name: service.name }))}
              cancelHref="/dashboard/servicos/pacotes"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
