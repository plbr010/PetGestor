import Link from "next/link";
import { Plus } from "lucide-react";

import { SpeciesFilterForm } from "@/features/pets/components/species-filter-form";
import { getPets } from "@/features/pets/queries";
import type { PetSpeciesFilter } from "@/features/pets/types";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  calculateAgeLabel,
  formatDateDisplay,
  SPECIES_LABELS,
} from "@/lib/pet-display";
import { parsePageParam } from "@/lib/pagination";
import { PetAvatar } from "@/components/shared/pet-avatar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  ClearSearchLink,
  PaginationNav,
  SearchForm,
} from "@/components/shared/pagination-nav";
import { FormFeedback } from "@/components/shared/form-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PetsPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    species?: string;
    arquivado?: string;
  }>;
};

function parseSpeciesFilter(value: string | undefined): PetSpeciesFilter {
  if (value === "dog" || value === "cat" || value === "other") {
    return value;
  }

  return "all";
}

export default async function PetsPage({ searchParams }: PetsPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";
  const species = parseSpeciesFilter(params.species);

  const result = await getPets({
    companyId: context.membership.company.id,
    page,
    query,
    species,
  });

  return (
    <>
      <DashboardHeader title="Pets" description="animais cadastrados no pet shop" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Pet arquivado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "pet cadastrado" : "pets cadastrados"}
          </p>
          <ButtonLink href="/dashboard/pets/novo">
            <Plus className="size-4" aria-hidden="true" />
            Novo pet
          </ButtonLink>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle>Lista de pets</CardTitle>
                <CardDescription>Busque por nome ou raça e filtre por espécie.</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-3 lg:max-w-2xl lg:flex-row">
                <SearchForm
                  action="/dashboard/pets"
                  defaultValue={query}
                  placeholder="Buscar pets..."
                  hiddenFields={{ species: species !== "all" ? species : undefined }}
                />
                <SpeciesFilterForm species={species} query={query || undefined} />
              </div>
            </div>
            <ClearSearchLink
              href={`/dashboard/pets${species !== "all" ? `?species=${species}` : ""}`}
              visible={Boolean(query)}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query || species !== "all" ? "Nenhum pet encontrado" : "Nenhum pet cadastrado"}
                description="Cadastre pets e vincule-os aos tutores do seu pet shop."
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Pet</th>
                        <th className="px-4 py-3 font-medium">Tutor</th>
                        <th className="px-4 py-3 font-medium">Espécie</th>
                        <th className="px-4 py-3 font-medium">Raça</th>
                        <th className="px-4 py-3 font-medium">Idade</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((pet) => (
                        <tr key={pet.id} className="border-t">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <PetAvatar name={pet.name} photoUrl={pet.photoThumbUrl} size="sm" />
                              <span className="font-medium">{pet.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{pet.customerName}</td>
                          <td className="px-4 py-3">{SPECIES_LABELS[pet.species]}</td>
                          <td className="px-4 py-3">{pet.breed ?? "—"}</td>
                          <td className="px-4 py-3">{calculateAgeLabel(pet.birth_date)}</td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/pets/${pet.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Ver detalhes
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {result.data.map((pet) => (
                    <Link
                      key={pet.id}
                      href={`/dashboard/pets/${pet.id}`}
                      className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <PetAvatar name={pet.name} photoUrl={pet.photoThumbUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{pet.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{pet.customerName}</p>
                        <p className="text-sm text-muted-foreground">
                          {SPECIES_LABELS[pet.species]}
                          {pet.breed ? ` · ${pet.breed}` : ""}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {calculateAgeLabel(pet.birth_date)} · {formatDateDisplay(pet.birth_date)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>

                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/pets"
                  searchParams={{
                    q: query || undefined,
                    species: species !== "all" ? species : undefined,
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
