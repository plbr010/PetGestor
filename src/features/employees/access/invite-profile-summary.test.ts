import { describe, expect, it } from "vitest";

import {
  getAccessProfileHighlights,
  getAccessProfileLabel,
} from "@/features/employees/access/invite-profile-summary";

describe("invite profile summary", () => {
  it("traduz perfil de recepção", () => {
    expect(getAccessProfileLabel("reception")).toBe("Recepção");
  });

  it("destaca acessos principais da recepção sem financeiro", () => {
    const highlights = getAccessProfileHighlights("reception");
    expect(highlights).toContain("Clientes");
    expect(highlights).toContain("Agenda");
    expect(highlights).not.toContain("Financeiro");
  });

  it("gerente inclui mais módulos", () => {
    const highlights = getAccessProfileHighlights("manager");
    expect(highlights.length).toBeGreaterThan(0);
  });
});
