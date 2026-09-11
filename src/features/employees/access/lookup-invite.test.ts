import { describe, expect, it } from "vitest";

import { lookupPendingInviteByEmailAction } from "@/features/employees/access/lookup-invite";

describe("lookupPendingInviteByEmailAction anti-enumeração", () => {
  it("e-mail válido sempre segue sem revelar se há convite", async () => {
    const existing = await lookupPendingInviteByEmailAction("existe@pet.com");
    const missing = await lookupPendingInviteByEmailAction("naoexiste@pet.com");

    expect(existing).toEqual({ ok: true, email: "existe@pet.com" });
    expect(missing).toEqual({ ok: true, email: "naoexiste@pet.com" });
    expect("found" in existing).toBe(false);
    expect("companyName" in existing).toBe(false);
  });

  it("e-mail inválido não vaza existência", async () => {
    const result = await lookupPendingInviteByEmailAction("invalido");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/e-mail válido/i);
    }
  });
});
