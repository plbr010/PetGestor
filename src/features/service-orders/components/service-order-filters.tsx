import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type ServiceOrderFiltersProps = {
  date: string;
  status: string;
};

export function ServiceOrderFilters({ date, status }: ServiceOrderFiltersProps) {
  return (
    <form action="/dashboard/atendimentos" method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="date">Data</Label>
        <Input id="date" name="date" type="date" defaultValue={date} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={status}>
          <option value="all">Todos</option>
          <option value="waiting">Aguardando</option>
          <option value="in_progress">Em atendimento</option>
          <option value="ready">Pronto para buscar</option>
          <option value="completed">Finalizado</option>
          <option value="cancelled">Cancelado</option>
        </Select>
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
