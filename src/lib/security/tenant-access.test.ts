import { describe, expect, it } from "vitest";

import {
  didMutateAccessibleRow,
  shouldTreatAsNotFound,
} from "@/lib/security/tenant-access";

describe("tenant-access helpers", () => {
  it("didMutateAccessibleRow detecta sucesso", () => {
    expect(
      didMutateAccessibleRow({
        data: { id: "550e8400-e29b-41d4-a716-446655440000" },
        error: null,
      }),
    ).toBe(true);
  });

  it("didMutateAccessibleRow detecta zero rows", () => {
    expect(
      didMutateAccessibleRow({
        data: null,
        error: null,
      }),
    ).toBe(false);

    expect(
      didMutateAccessibleRow({
        data: null,
        error: { code: "42501" },
      }),
    ).toBe(false);
  });

  it("shouldTreatAsNotFound cobre recurso inacessível", () => {
    expect(shouldTreatAsNotFound(false, false)).toBe(true);
    expect(shouldTreatAsNotFound(true, false)).toBe(true);
    expect(shouldTreatAsNotFound(true, true)).toBe(false);
  });
});
