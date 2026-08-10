"use client";

import { Select } from "@/components/ui/select";

type SpeciesFilterFormProps = {
  species: string;
  query?: string;
};

export function SpeciesFilterForm({ species, query }: SpeciesFilterFormProps) {
  return (
    <form action="/dashboard/pets" method="get" className="flex gap-2">
      {query ? <input type="hidden" name="q" value={query} /> : null}
      <input type="hidden" name="page" value="1" />
      <Select
        name="species"
        defaultValue={species}
        aria-label="Filtrar por espécie"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="all">Todos</option>
        <option value="dog">Cães</option>
        <option value="cat">Gatos</option>
        <option value="other">Outros</option>
      </Select>
    </form>
  );
}
