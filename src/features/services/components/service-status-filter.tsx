import Link from "next/link";

import type { ServiceStatusFilter } from "@/features/services/types";

const STATUS_OPTIONS: { value: ServiceStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

type ServiceStatusFilterNavProps = {
  current: ServiceStatusFilter;
  basePath?: string;
  searchParams?: Record<string, string | undefined>;
};

export function ServiceStatusFilterNav({
  current,
  basePath = "/dashboard/servicos",
  searchParams = {},
}: ServiceStatusFilterNavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_OPTIONS.map((option) => {
        const params = new URLSearchParams();

        for (const [key, value] of Object.entries(searchParams)) {
          if (value) {
            params.set(key, value);
          }
        }

        if (option.value === "all") {
          params.delete("status");
        } else {
          params.set("status", option.value);
        }

        params.delete("page");

        const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;
        const isActive = current === option.value;

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
  );
}
