import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type AgendaFiltersProps = {
  date: string;
  view: "day" | "week";
  employees: { id: string; name: string }[];
  employeeId?: string;
  status: string;
};

export function AgendaFilters({
  date,
  view,
  employees,
  employeeId,
  status,
}: AgendaFiltersProps) {
  return (
    <form action="/dashboard/agenda" method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="view" value={view} />

      <div className="space-y-2">
        <Label htmlFor="employee">Profissional</Label>
        <Select id="employee" name="employee" defaultValue={employeeId ?? ""}>
          <option value="">Todos os profissionais</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={status}>
          <option value="all">Todos</option>
          <option value="scheduled">Agendado</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
          <option value="no_show">Não compareceu</option>
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
