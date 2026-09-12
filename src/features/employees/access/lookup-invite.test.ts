import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();

vi.mock("@/lib/security/rate-limit", () => ({
  enforceAuthRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

describe("lookupPendingInviteByEmailAction", () => {
  beforeEach(() => {
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("não distingue e-mail com ou sem convite", async () => {
    const { lookupPendingInviteByEmailAction } = await import(
      "@/features/employees/access/lookup-invite"
    );

    const existing = await lookupPendingInviteByEmailAction("existe@petshop.com");
    const missing = await lookupPendingInviteByEmailAction("naoexiste@petshop.com");

    expect(existing).toEqual({ ok: true, email: "existe@petshop.com" });
    expect(missing).toEqual({ ok: true, email: "naoexiste@petshop.com" });
    expect(Object.keys(existing)).toEqual(Object.keys(missing));
  });

  it("e-mail inválido não revela existência", async () => {
    const { lookupPendingInviteByEmailAction } = await import(
      "@/features/employees/access/lookup-invite"
    );
    const result = await lookupPendingInviteByEmailAction("nao-e-email");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/e-mail válido/i);
    }
  });
});
