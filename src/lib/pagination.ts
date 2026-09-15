export const DEFAULT_PAGE_SIZE = 20;

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RangeQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

export type RangeQueryResult<T> = {
  data: T[] | null;
  count?: number | null;
  error: RangeQueryError | null;
};

export function parsePageParam(value: string | undefined | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function getPaginationRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  return { from, to };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data,
    total,
    page: Math.min(page, totalPages),
    pageSize,
    totalPages,
  };
}

export function sanitizeSearchTerm(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

export function isUnsatisfiableRangeError(error: RangeQueryError | null | undefined): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "PGRST103" || error.status === 416) {
    return true;
  }

  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return text.includes("requested range not satisfiable");
}

/**
 * Executa a página pedida. Se o PostgREST recusar o intervalo (página além do total),
 * consulta só o count e devolve lista vazia com o total real — sem lançar PGRST103.
 * Outros erros continuam falhando (não mascarar).
 */
export async function resolvePaginatedRange<T>(options: {
  page: number;
  pageSize: number;
  loadErrorMessage: string;
  fetchPage: () => Promise<RangeQueryResult<T>>;
  fetchCount: () => Promise<{ count: number | null; error: RangeQueryError | null }>;
}): Promise<PaginatedResult<T>> {
  const pageResult = await options.fetchPage();

  if (!pageResult.error) {
    return buildPaginatedResult(
      pageResult.data ?? [],
      pageResult.count ?? 0,
      options.page,
      options.pageSize,
    );
  }

  if (!isUnsatisfiableRangeError(pageResult.error)) {
    throw new Error(options.loadErrorMessage);
  }

  const countResult = await options.fetchCount();
  if (countResult.error) {
    throw new Error(options.loadErrorMessage);
  }

  return buildPaginatedResult([], countResult.count ?? 0, options.page, options.pageSize);
}

export function buildListHref(
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

/** Se `page` pedido for maior que a última página, devolve o href da última válida. */
export function outOfRangeListHref(
  requestedPage: number,
  totalPages: number,
  basePath: string,
  searchParams?: Record<string, string | undefined>,
): string | null {
  if (requestedPage <= totalPages) {
    return null;
  }

  return buildListHref(basePath, totalPages, searchParams);
}
