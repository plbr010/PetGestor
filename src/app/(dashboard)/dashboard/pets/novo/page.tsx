import { getCustomerOptions } from "@/features/customers/queries";
import { PetForm } from "@/features/pets/components/pet-form";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type NewPetPageProps = {
  searchParams: Promise<{ tutor?: string }>;
};

export default async function NewPetPage({ searchParams }: NewPetPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const customers = await getCustomerOptions(context.membership.company.id);

  return (
    <>
      <DashboardHeader title="Novo pet" description="cadastro de animal" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Dados do pet</CardTitle>
            <CardDescription>Vincule o pet a um tutor da sua empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <div className="space-y-4">
                <EmptyState
                  title="Cadastre um tutor primeiro"
                  description="É necessário ter pelo menos um tutor ativo antes de cadastrar pets."
                />
                <ButtonLink href="/dashboard/tutores/novo">Cadastrar tutor</ButtonLink>
              </div>
            ) : (
              <PetForm
                mode="create"
                customers={customers}
                defaultCustomerId={params.tutor}
                cancelHref={
                  params.tutor
                    ? `/dashboard/tutores/${params.tutor}`
                    : "/dashboard/pets"
                }
              />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
