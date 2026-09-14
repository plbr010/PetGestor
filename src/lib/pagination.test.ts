import { describe, expect, it } from "vitest";

import {
  buildListHref,
  buildPaginatedResult,
  getPaginationRange,
  isUnsatisfiableRangeError,
  outOfRangeListHref,
  parsePageParam,
  resolvePaginatedRange,
  sanitizeSearchTerm,
} from "@/lib/pagination";

describe("pagination helpers", () => {
  it("parsePageParam retorna 1 para valores inválidos", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("2.9")).toBe(2);
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("2")).toBe(2);
  });

  it("getPaginationRange calcula intervalo", () => {
    expect(getPaginationRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(getPaginationRange(2, 20)).toEqual({ from: 20, to: 39 });
  });

  it("buildPaginatedResult calcula totalPages", () => {
    const result = buildPaginatedResult(["a", "b"], 45, 2, 20);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(2);
  });

  it("buildPaginatedResult clampa página além do total sem zerar o total", () => {
    const result = buildPaginatedResult([], 5, 2, 20);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data).toEqual([]);
  });

  it("sanitizeSearchTerm remove caracteres perigosos", () => {
    expect(sanitizeSearchTerm("  ana%_silva  ")).toBe("ana silva");
  });

  it("isUnsatisfiableRangeError reconhece PGRST103 / 416", () => {
    expect(isUnsatisfiableRangeError({ code: "PGRST103" })).toBe(true);
    expect(isUnsatisfiableRangeError({ status: 416 })).toBe(true);
    expect(
      isUnsatisfiableRangeError({ message: "Requested range not satisfiable" }),
    ).toBe(true);
    expect(isUnsatisfiableRangeError({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
    expect(isUnsatisfiableRangeError(null)).toBe(false);
  });

  it("buildListHref omite page=1 e preserva busca", () => {
    expect(buildListHref("/dashboard/tutores", 1)).toBe("/dashboard/tutores");
    expect(buildListHref("/dashboard/tutores", 2)).toBe("/dashboard/tutores?page=2");
    expect(buildListHref("/dashboard/tutores", 1, { q: "ana" })).toBe(
      "/dashboard/tutores?q=ana",
    );
    expect(buildListHref("/dashboard/pets", 2, { q: "rex", species: "dog" })).toBe(
      "/dashboard/pets?page=2&q=rex&species=dog",
    );
  });

  it("outOfRangeListHref redireciona para a última página válida", () => {
    expect(outOfRangeListHref(1, 1, "/dashboard/tutores")).toBeNull();
    expect(outOfRangeListHref(2, 2, "/dashboard/tutores")).toBeNull();
    expect(outOfRangeListHref(2, 1, "/dashboard/tutores")).toBe("/dashboard/tutores");
    expect(outOfRangeListHref(9, 3, "/dashboard/servicos", { q: "banho" })).toBe(
      "/dashboard/servicos?page=3&q=banho",
    );
  });
});

describe("resolvePaginatedRange", () => {
  it("page=1 devolve os registros e o total", async () => {
    const result = await resolvePaginatedRange({
      page: 1,
      pageSize: 20,
      loadErrorMessage: "falha",
      fetchPage: async () => ({
        data: [{ id: "a" }, { id: "b" }],
        count: 2,
        error: null,
      }),
      fetchCount: async () => {
        throw new Error("count não deve ser chamado no caminho feliz");
      },
    });

    expect(result).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it("page=2 existente devolve a fatia sem consultar count extra", async () => {
    const result = await resolvePaginatedRange({
      page: 2,
      pageSize: 20,
      loadErrorMessage: "falha",
      fetchPage: async () => ({
        data: [{ id: "c" }],
        count: 21,
        error: null,
      }),
      fetchCount: async () => {
        throw new Error("count não deve ser chamado no caminho feliz");
      },
    });

    expect(result.page).toBe(2);
    expect(result.total).toBe(21);
    expect(result.totalPages).toBe(2);
    expect(result.data).toEqual([{ id: "c" }]);
  });

  it("página além do limite consulta o count real e não lança PGRST103", async () => {
    let counted = false;
    const result = await resolvePaginatedRange({
      page: 2,
      pageSize: 20,
      loadErrorMessage: "Não foi possível carregar os tutores.",
      fetchPage: async () => ({
        data: null,
        count: null,
        error: { code: "PGRST103", message: "Requested range not satisfiable" },
      }),
      fetchCount: async () => {
        counted = true;
        return { count: 5, error: null };
      },
    });

    expect(counted).toBe(true);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(1);
    expect(result.data).toEqual([]);
    expect(result.page).toBe(1);
  });

  it("arquivar o último registro da página 2 recupera o total restante", async () => {
    const result = await resolvePaginatedRange({
      page: 2,
      pageSize: 20,
      loadErrorMessage: "falha",
      fetchPage: async () => ({
        data: null,
        count: null,
        error: { code: "PGRST103", message: "Requested range not satisfiable" },
      }),
      fetchCount: async () => ({ count: 20, error: null }),
    });

    expect(result.total).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(result.data).toEqual([]);
    expect(outOfRangeListHref(2, result.totalPages, "/dashboard/tutores")).toBe(
      "/dashboard/tutores",
    );
  });

  it("busca + paginação além do limite preserva o total filtrado", async () => {
    const result = await resolvePaginatedRange({
      page: 3,
      pageSize: 20,
      loadErrorMessage: "falha",
      fetchPage: async () => ({
        data: null,
        count: null,
        error: { code: "PGRST103" },
      }),
      fetchCount: async () => ({ count: 4, error: null }),
    });

    expect(result.total).toBe(4);
    expect(outOfRangeListHref(3, result.totalPages, "/dashboard/pets", { q: "rex" })).toBe(
      "/dashboard/pets?q=rex",
    );
  });

  it("erro real do PostgREST não é mascarado como lista vazia", async () => {
    await expect(
      resolvePaginatedRange({
        page: 1,
        pageSize: 20,
        loadErrorMessage: "Não foi possível carregar os pets.",
        fetchPage: async () => ({
          data: null,
          count: null,
          error: { code: "42501", message: "permission denied" },
        }),
        fetchCount: async () => ({ count: 9, error: null }),
      }),
    ).rejects.toThrow("Não foi possível carregar os pets.");
  });
});
