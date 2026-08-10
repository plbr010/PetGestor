import Link from "next/link";

import type {
  EmployeeSchedulableFilter,
  EmployeeStatusFilter,
} from "@/features/employees/types";

const STATUS_OPTIONS: { value: EmployeeStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

const SCHEDULABLE_OPTIONS: { value: EmployeeSchedulableFilter; label: string }[] = [
  { value: "all", label: "Agenda: todos" },
  { value: "yes", label: "Agendáveis" },
  { value: "no", label: "Não agendáveis" },
];

type EmployeeFiltersProps = {
  status: EmployeeStatusFilter;
  schedulable: EmployeeSchedulableFilter;
  query?: string;
};

function buildHref(
  status: EmployeeStatusFilter,
  schedulable: EmployeeSchedulableFilter,
  query?: string,
): string {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (schedulable !== "all") {
    params.set("schedulable", schedulable);
  }

  const queryString = params.toString();
  return queryString ? `/dashboard/funcionarios?${queryString}` : "/dashboard/funcionarios";
}

export function EmployeeFilters({ status, schedulable, query }: EmployeeFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const isActive = status === option.value;
          const href = buildHref(option.value, schedulable, query);

          return (
            <Link
              key={option.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {SCHEDULABLE_OPTIONS.map((option) => {
          const isActive = schedulable === option.value;
          const href = buildHref(status, option.value, query);

          return (
            <Link
              key={option.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
