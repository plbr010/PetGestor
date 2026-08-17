import Link from "next/link";

import { PetImportantInfoPanel } from "@/features/pets/history/components/pet-important-info-panel";
import { PetHistoryTimeline } from "@/features/pets/history/components/pet-history-timeline";
import { PetSummaryCards } from "@/features/pets/history/components/pet-summary-cards";
import {
  getPetHistoryPage,
  getPetHistorySummary,
} from "@/features/pets/history/queries";
import { parsePetHistoryFilter } from "@/features/pets/history/types";
import { PetPackagesPanel } from "@/features/service-packages/components/pet-packages-panel";
import { SellPackageForm } from "@/features/service-packages/components/sell-package-form";
import {
  getCustomerPackagesForPet,
  getServicePackages,
} from "@/features/service-packages/queries";
import { ArchivePetButton } from "@/features/pets/components/archive-pet-button";
import { requirePetById } from "@/features/pets/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  calculateAgeLabel,
  formatDateDisplay,
  formatDateTimeDisplay,
  SEX_LABELS,
  SPECIES_LABELS,
} from "@/lib/pet-display";
import { parsePageParam } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PetDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    atualizado?: string;
    pacote?: string;
    historico?: string;
    filtro?: string;
    info?: string;
  }>;
};

export default async function PetDetailPage({ params, searchParams }: PetDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const historyPage = parsePageParam(query.historico ?? "1");
  const historyFilter = parsePetHistoryFilter(query.filtro);

  const pet = await requirePetById(context.membership.company.id, id);

  const [packages, catalogPackages, summary, history] = await Promise.all([
    getCustomerPackagesForPet(context.membership.company.id, id, timeZone),
    getServicePackages({ companyId: context.membership.company.id, activeOnly: true }),
    getPetHistorySummary(context.membership.company.id, id),
    getPetHistoryPage(context.membership.company.id, id, historyPage),
  ]);

  return (
    <>
      <DashboardHeader title={pet.name} description="detalhes do pet" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Pet atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ButtonLink href={`/dashboard/pets/${id}/editar`} variant="outline">
            Editar pet
          </ButtonLink>
          <ArchivePetButton petId={id} />
        </div>

        <PetImportantInfoPanel
          petId={id}
          allergies={pet.allergies}
          importantNotes={pet.important_notes}
          saved={query.info === "salvo"}
        />

        <PetSummaryCards summary={summary} timeZone={timeZone} />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações do pet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Espécie" value={SPECIES_LABELS[pet.species]} />
              <DetailRow label="Raça" value={pet.breed ?? "—"} />
              <DetailRow label="Sexo" value={SEX_LABELS[pet.sex]} />
              <DetailRow label="Nascimento" value={formatDateDisplay(pet.birth_date)} />
              <DetailRow label="Idade" value={calculateAgeLabel(pet.birth_date)} />
              <DetailRow
                label="Peso"
                value={pet.weight_kg ? `${pet.weight_kg.toString()} kg` : "—"}
              />
              <DetailRow label="Cor" value={pet.color ?? "—"} />
              <DetailRow label="Cadastrado em" value={formatDateTimeDisplay(pet.created_at)} />
              {pet.notes ? (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-muted-foreground">Observações gerais</p>
                  <p className="mt-1 whitespace-pre-wrap">{pet.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tutor responsável</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Nome" value={pet.customer.name} />
              <DetailRow label="Telefone" value={formatPhoneDisplay(pet.customer.phone)} />
              <Link
                href={`/dashboard/tutores/${pet.customer.id}`}
                className="inline-flex font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver cadastro do tutor
              </Link>
            </CardContent>
          </Card>
        </div>

        <PetHistoryTimeline
          petId={id}
          events={history.events}
          page={history.page}
          hasMore={history.hasMore}
          initialFilter={historyFilter}
        />

        <Card>
          <CardHeader>
            <CardTitle>Adicionar pacote</CardTitle>
          </CardHeader>
          <CardContent>
            <SellPackageForm
              petId={id}
              packages={catalogPackages}
              timeZone={timeZone}
            />
          </CardContent>
        </Card>

        <PetPackagesPanel petId={id} packages={packages} sold={query.pacote === "1"} />
      </main>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
