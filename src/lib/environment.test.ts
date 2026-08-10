import { describe, expect, it } from "vitest";

describe("vitest environment", () => {
  it("executa testes com sucesso", () => {
    expect(true).toBe(true);
  });

  it("possui ambiente DOM disponível", () => {
    expect(typeof document).toBe("object");
  });
});
