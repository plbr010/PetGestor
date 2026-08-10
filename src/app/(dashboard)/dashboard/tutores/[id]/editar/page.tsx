import { updateCustomerAction } from "@/features/customers/actions";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { requireCustomerById } from "@/features/customers/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const customer = await requireCustomerById(context.membership.company.id, id);

  const boundAction = updateCustomerAction.bind(null, id);

  return (
    <>
      <DashboardHeader title="Editar tutor" description={customer.name} />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Atualizar cadastro</CardTitle>
            <CardDescription>Altere os dados do tutor quando necessário.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerForm
              mode="edit"
              customer={customer}
              cancelHref={`/dashboard/tutores/${id}`}
              action={boundAction}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
