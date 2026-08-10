import { describe, expect, it } from "vitest";

import { isValidUuid, parseUuid } from "@/lib/security/uuid";

describe("uuid security helpers", () => {
  it("aceita UUID válido", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejeita UUID inválido", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid(null)).toBe(false);
  });

  it("parseUuid retorna null para inválido", () => {
    expect(parseUuid("abc")).toBeNull();
    expect(parseUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });
});
