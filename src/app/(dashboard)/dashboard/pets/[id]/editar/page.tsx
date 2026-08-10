import { getCustomerOptions } from "@/features/customers/queries";
import { updatePetAction } from "@/features/pets/actions";
import { PetForm } from "@/features/pets/components/pet-form";
import { requirePetById } from "@/features/pets/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EditPetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPetPage({ params }: EditPetPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const [pet, customers] = await Promise.all([
    requirePetById(context.membership.company.id, id),
    getCustomerOptions(context.membership.company.id),
  ]);

  const boundAction = updatePetAction.bind(null, id);

  return (
    <>
      <DashboardHeader title="Editar pet" description={pet.name} />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Atualizar cadastro</CardTitle>
            <CardDescription>Altere os dados do pet quando necessário.</CardDescription>
          </CardHeader>
          <CardContent>
            <PetForm
              mode="edit"
              pet={pet}
              customers={customers}
              cancelHref={`/dashboard/pets/${id}`}
              action={boundAction}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
