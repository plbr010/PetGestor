export const DEFAULT_PAGE_SIZE = 20;

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
