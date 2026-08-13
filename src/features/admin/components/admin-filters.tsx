import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AdminAccountStatusFilter } from "@/features/admin/types";
import { adminStatusLabel } from "@/features/admin/utils";

const STATUS_OPTIONS: AdminAccountStatusFilter[] = [
  "all",
  "trial",
  "active",
  "past_due",
  "cancelled",
  "blocked",
];

type AdminFiltersProps = {
  query: string;
  status: AdminAccountStatusFilter;
};

export function AdminFilters({ query, status }: AdminFiltersProps) {
  return (
    <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="admin-q">Buscar</Label>
        <Input
          id="admin-q"
          name="q"
          defaultValue={query}
          placeholder="Nome do pet shop ou e-mail"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-status">Status</Label>
        <Select id="admin-status" name="status" defaultValue={status}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "Todos" : adminStatusLabel(option)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" className="h-10">
        Filtrar
      </Button>
      {(query || status !== "all") && (
        <ButtonLink href="/admin" variant="outline" className="h-10 sm:col-span-3 sm:w-fit">
          Limpar filtros
        </ButtonLink>
      )}
    </form>
  );
}
