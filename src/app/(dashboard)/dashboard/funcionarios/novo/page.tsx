import { EmployeeForm } from "@/features/employees/components/employee-form";
import { getActiveServices } from "@/features/services/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewEmployeePage() {
  const context = await requireCompanyContext();
  const availableServices = await getActiveServices(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Novo funcionário" description="cadastro de funcionário" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>Informações do funcionário</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeForm
              mode="create"
              availableServices={availableServices}
              cancelHref="/dashboard/funcionarios"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
