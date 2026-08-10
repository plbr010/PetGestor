import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/utils";

type PaginationNavProps = {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  className?: string;
};

function buildHref(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function PaginationNav({
  page,
  totalPages,
  basePath,
  searchParams,
  className,
}: PaginationNavProps) {
  if (totalPages <= 1) {
    return null;
  }

  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <nav
      className={cn("flex items-center justify-between gap-3", className)}
      aria-label="Paginação"
    >
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <ButtonLink href={buildHref(basePath, prevPage, searchParams)} variant="outline" size="sm">
            Anterior
          </ButtonLink>
        ) : (
          <span className="inline-flex h-7 items-center rounded-lg border px-2.5 text-sm text-muted-foreground opacity-50">
            Anterior
          </span>
        )}
        {page < totalPages ? (
          <ButtonLink href={buildHref(basePath, nextPage, searchParams)} variant="outline" size="sm">
            Próxima
          </ButtonLink>
        ) : (
          <span className="inline-flex h-7 items-center rounded-lg border px-2.5 text-sm text-muted-foreground opacity-50">
            Próxima
          </span>
        )}
      </div>
    </nav>
  );
}

export function SearchForm({
  action,
  defaultValue,
  placeholder,
  hiddenFields,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  hiddenFields?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" className="flex w-full flex-col gap-2 sm:flex-row">
      {Object.entries(hiddenFields ?? {}).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <input type="hidden" name="page" value="1" />
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={placeholder}
      />
      <button
        type="submit"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Buscar
      </button>
    </form>
  );
}

export function ClearSearchLink({
  href,
  visible,
}: {
  href: string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
      Limpar busca
    </Link>
  );
}
