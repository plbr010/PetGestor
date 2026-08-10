import { updateEmployeeAction } from "@/features/employees/actions";
import { EmployeeForm } from "@/features/employees/components/employee-form";
import { requireEmployeeById } from "@/features/employees/queries";
import { getActiveServices } from "@/features/services/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditEmployeePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const [employee, availableServices] = await Promise.all([
    requireEmployeeById(context.membership.company.id, id),
    getActiveServices(context.membership.company.id),
  ]);

  const boundAction = updateEmployeeAction.bind(null, id);

  return (
    <>
      <DashboardHeader title={`Editar ${employee.name}`} description="alteração de funcionário" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>Informações do funcionário</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeForm
              mode="edit"
              employee={employee}
              availableServices={availableServices}
              cancelHref={`/dashboard/funcionarios/${id}`}
              action={boundAction}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
