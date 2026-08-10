import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const rpcMock = vi.fn();
const getClaimsMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: getClaimsMock,
    },
    rpc: rpcMock,
    from: fromMock,
  })),
}));

describe("runCompleteOnboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    getClaimsMock.mockReset();
    fromMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retorna erro quando usuário não está autenticado", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/sessão expirou/i);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("retorna erro quando RPC falha", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "authentication_required" },
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/configuração inicial/i);
    }
  });

  it("retorna erro quando RPC não retorna company id", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop");

    expect(result.ok).toBe(false);
  });

  it("retorna erro quando membership não é legível após RPC", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "company-456", error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "42501", message: "permission denied" },
            }),
          }),
        }),
      }),
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/confirmar o acesso/i);
    }
  });

  it("retorna sucesso quando RPC e membership estão ok", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "company-456", error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { company_id: "company-456" },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop");

    expect(result).toEqual({ ok: true, companyId: "company-456" });
  });
});
