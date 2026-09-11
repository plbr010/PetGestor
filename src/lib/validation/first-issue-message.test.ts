import { describe, expect, it } from "vitest";

import { firstIssueMessage } from "@/lib/validation/first-issue-message";

describe("firstIssueMessage", () => {
  it("mantém mensagem pt-BR", () => {
    expect(firstIssueMessage([{ message: "Informe um e-mail válido." }])).toBe(
      "Informe um e-mail válido.",
    );
  });

  it("não entrega raw do Zod em inglês", () => {
    expect(firstIssueMessage([{ message: "Invalid input" }])).toBe("Dados inválidos.");
    expect(firstIssueMessage([{ message: "Required" }])).toBe("Dados inválidos.");
    expect(firstIssueMessage([{ message: "Expected string" }])).toBe("Dados inválidos.");
    expect(firstIssueMessage([{ message: "Too small: expected string to have >=1 characters" }])).toBe(
      "Dados inválidos.",
    );
  });
});
