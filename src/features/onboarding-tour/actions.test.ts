import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const requireUserMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: rpcMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

describe("completeOnboardingTutorialAction", () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    requireUserMock.mockReset();
    revalidatePathMock.mockReset();
    requireUserMock.mockResolvedValue({ id: "user-1", email: "a@b.com" });
  });

  it("marca tutorial via RPC sem aceitar user_id externo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { completeOnboardingTutorialAction } = await import(
      "@/features/onboarding-tour/actions"
    );
    const result = await completeOnboardingTutorialAction();

    expect(result).toEqual({ success: true });
    expect(requireUserMock).toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("complete_onboarding_tutorial");
    expect(rpcMock.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("retorna erro amigável quando RPC falha", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "fail" } });

    const { completeOnboardingTutorialAction } = await import(
      "@/features/onboarding-tour/actions"
    );
    const result = await completeOnboardingTutorialAction();

    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/tutorial/i);
  });
});
