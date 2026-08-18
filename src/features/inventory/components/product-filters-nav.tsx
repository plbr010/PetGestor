import Link from "next/link";

import type { ProductArchiveFilter, ProductStockFilter } from "@/features/inventory/types";

function buildHref(
  basePath: string,
  next: Record<string, string | undefined>,
  current: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...current, ...next })) {
    if (value) {
      params.set(key, value);
    }
  }

  params.delete("page");
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ProductFiltersNav({
  archive,
  stock,
  query,
  categoryId,
}: {
  archive: ProductArchiveFilter;
  stock: ProductStockFilter;
  query?: string;
  categoryId?: string;
}) {
  const current = {
    q: query,
    category: categoryId,
    archive: archive === "active" ? undefined : archive,
    stock: stock === "all" ? undefined : stock,
  };

  const archiveOptions: Array<{ value: ProductArchiveFilter; label: string }> = [
    { value: "active", label: "Ativos" },
    { value: "archived", label: "Arquivados" },
    { value: "all", label: "Todos" },
  ];

  const stockOptions: Array<{ value: ProductStockFilter; label: string }> = [
    { value: "all", label: "Qualquer estoque" },
    { value: "low", label: "Estoque baixo" },
    { value: "out", label: "Sem estoque" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {archiveOptions.map((option) => {
          const href = buildHref(
            "/dashboard/estoque",
            { archive: option.value === "active" ? undefined : option.value },
            current,
          );

          return (
            <Link
              key={option.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                archive === option.value
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
        {stockOptions.map((option) => {
          const href = buildHref(
            "/dashboard/estoque",
            { stock: option.value === "all" ? undefined : option.value },
            current,
          );

          return (
            <Link
              key={option.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                stock === option.value
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
