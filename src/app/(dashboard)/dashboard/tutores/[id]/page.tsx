import Link from "next/link";
import { PawPrint, Plus } from "lucide-react";

import { ArchiveCustomerButton } from "@/features/customers/components/archive-customer-button";
import {
  countActivePetsForCustomer,
  requireCustomerById,
} from "@/features/customers/queries";
import { getPetsByCustomer } from "@/features/pets/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  calculateAgeLabel,
  formatDateDisplay,
  formatDateTimeDisplay,
  SPECIES_LABELS,
} from "@/lib/pet-display";
import { PetAvatar } from "@/components/shared/pet-avatar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const customer = await requireCustomerById(context.membership.company.id, id);
  const pets = await getPetsByCustomer(context.membership.company.id, id);
  const activePetsCount = await countActivePetsForCustomer(
    context.membership.company.id,
    id,
  );

  return (
    <>
      <DashboardHeader title={customer.name} description="detalhes do tutor" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Tutor atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/tutores/${id}/editar`} variant="outline">
              Editar tutor
            </ButtonLink>
            <ButtonLink href={`/dashboard/pets/novo?tutor=${id}`} data-tour-id="cta-add-pet">
              <Plus className="size-4" aria-hidden="true" />
              Adicionar pet
            </ButtonLink>
          </div>
          <ArchiveCustomerButton customerId={id} disabled={activePetsCount > 0} />
        </div>

        {activePetsCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Este tutor possui pets ativos. Arquive os pets antes de arquivar o cadastro.
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações do tutor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Telefone</span>
                <span className="font-medium">{formatPhoneDisplay(customer.phone)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">E-mail</span>
                <span className="font-medium">{customer.email ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cadastrado em</span>
                <span className="font-medium">{formatDateTimeDisplay(customer.created_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Pets ativos</span>
                <Badge variant="secondary">{activePetsCount}</Badge>
              </div>
              {customer.notes ? (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-muted-foreground">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pets do tutor</CardTitle>
              <CardDescription>
                {pets.length === 0
                  ? "Nenhum pet cadastrado para este tutor."
                  : `${pets.length} pet(s) vinculado(s).`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pets.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <PawPrint className="mx-auto mb-2 size-5" aria-hidden="true" />
                  Cadastre o primeiro pet deste tutor.
                </div>
              ) : (
                pets.map((pet) => (
                  <Link
                    key={pet.id}
                    href={`/dashboard/pets/${pet.id}`}
                    className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/20"
                  >
                    <PetAvatar name={pet.name} photoUrl={pet.photoThumbUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{pet.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {SPECIES_LABELS[pet.species]}
                        {pet.breed ? ` · ${pet.breed}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{calculateAgeLabel(pet.birth_date)}</p>
                      <p>{formatDateDisplay(pet.birth_date)}</p>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
