import Link from "next/link";

import { PetImportantInfoPanel } from "@/features/pets/history/components/pet-important-info-panel";
import { PetHistoryTimeline } from "@/features/pets/history/components/pet-history-timeline";
import { PetSummaryCards } from "@/features/pets/history/components/pet-summary-cards";
import {
  getPetAttachments,
  getPetGalleryPage,
  getPetPhotoView,
} from "@/features/attachments/queries";
import { PetPhotoPanel } from "@/features/attachments/components/pet-photo-panel";
import {
  PetAttachmentsPanel,
  PetGalleryPanel,
} from "@/features/attachments/components/pet-attachments-panel";
import {
  getPetHistoryPage,
  getPetHistorySummary,
} from "@/features/pets/history/queries";
import { parsePetHistoryFilter, PET_HISTORY_PAGE_SIZE } from "@/features/pets/history/types";
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
    galeria?: string;
  }>;
};

export default async function PetDetailPage({ params, searchParams }: PetDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const historyPage = parsePageParam(query.historico ?? "1");
  const galleryPage = parsePageParam(query.galeria ?? "1");
  const historyFilter = parsePetHistoryFilter(query.filtro);

  const pet = await requirePetById(context.membership.company.id, id);

  const [
    packagesResult,
    catalogPackagesResult,
    summaryResult,
    historyResult,
    photoResult,
    attachmentsResult,
    galleryResult,
  ] = await Promise.allSettled([
    getCustomerPackagesForPet(context.membership.company.id, id, timeZone),
    getServicePackages({ companyId: context.membership.company.id, activeOnly: true }),
    getPetHistorySummary(context.membership.company.id, id),
    getPetHistoryPage(context.membership.company.id, id, historyPage),
    getPetPhotoView(context.membership.company.id, pet),
    getPetAttachments(context.membership.company.id, id),
    getPetGalleryPage(context.membership.company.id, id, galleryPage),
  ]);

  const packages = packagesResult.status === "fulfilled" ? packagesResult.value : [];
  const catalogPackages =
    catalogPackagesResult.status === "fulfilled" ? catalogPackagesResult.value : [];
  const summary =
    summaryResult.status === "fulfilled"
      ? summaryResult.value
      : {
          lastServiceAt: null,
          lastServiceName: null,
          nextAppointmentAt: null,
          nextAppointmentServiceName: null,
          totalAppointments: 0,
          totalCompletedServices: 0,
          totalSpentCents: 0,
          topServiceName: null,
          topServiceCount: 0,
        };
  const history =
    historyResult.status === "fulfilled"
      ? historyResult.value
      : { events: [], page: historyPage, pageSize: PET_HISTORY_PAGE_SIZE, hasMore: false, totalAppointments: 0 };
  const photo =
    photoResult.status === "fulfilled"
      ? photoResult.value
      : { photoUrl: null, thumbUrl: null, updatedAt: null };
  const attachments = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : [];
  const gallery =
    galleryResult.status === "fulfilled"
      ? galleryResult.value
      : { items: [], page: galleryPage, pageSize: 12, hasMore: false, total: 0 };

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

        <PetPhotoPanel petId={id} petName={pet.name} photo={photo} />

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

        <div id="galeria">
          <PetGalleryPanel petId={id} initialPage={galleryPage} gallery={gallery} />
        </div>

        <PetAttachmentsPanel petId={id} attachments={attachments} />

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
