import { DashboardHeader } from "@/components/layout/dashboard-header";
import { CustomerForm } from "@/features/customers/components/customer-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewCustomerPage() {
  return (
    <>
      <DashboardHeader title="Novo tutor" description="cadastro de cliente/responsável" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Dados do tutor</CardTitle>
            <CardDescription>
              Preencha as informações básicas do responsável pelo pet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerForm mode="create" cancelHref="/dashboard/tutores" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
