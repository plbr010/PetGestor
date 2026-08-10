import { describe, expect, it } from "vitest";

import {
  buildPaginatedResult,
  getPaginationRange,
  parsePageParam,
  sanitizeSearchTerm,
} from "@/lib/pagination";

describe("pagination helpers", () => {
  it("parsePageParam retorna 1 para valores inválidos", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
  });

  it("getPaginationRange calcula intervalo", () => {
    expect(getPaginationRange(2, 20)).toEqual({ from: 20, to: 39 });
  });

  it("buildPaginatedResult calcula totalPages", () => {
    const result = buildPaginatedResult(["a", "b"], 45, 2, 20);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(2);
  });

  it("sanitizeSearchTerm remove caracteres perigosos", () => {
    expect(sanitizeSearchTerm("  ana%_silva  ")).toBe("ana silva");
  });
});
