import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const requireUserMock = vi.fn();
const requireCompanyMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/features/companies/queries", () => ({
  requireCompany: (...args: unknown[]) => requireCompanyMock(...args),
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
    requireCompanyMock.mockReset();
    revalidatePathMock.mockReset();
    requireUserMock.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    requireCompanyMock.mockResolvedValue({
      membership: { company: { id: "company-1" } },
    });
  });

  it("marca tutorial via upsert sem aceitar user_id externo", async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: "p1",
        company_id: "company-1",
        user_id: "user-1",
        onboarding_started_at: null,
        welcome_seen_at: "2026-08-25T00:00:00.000Z",
        guided_started_at: null,
        guided_skipped_at: null,
        guided_active: false,
        last_guided_step: null,
        workflow_step_viewed_at: null,
        finance_step_viewed_at: null,
        onboarding_completed_at: "2026-08-25T00:00:00.000Z",
        checklist_dismissed_at: "2026-08-25T00:00:00.000Z",
        created_at: "2026-08-25T00:00:00.000Z",
        updated_at: "2026-08-25T00:00:00.000Z",
      },
      error: null,
    });

    const { completeOnboardingTutorialAction } = await import(
      "@/features/onboarding-tour/actions"
    );
    const result = await completeOnboardingTutorialAction();

    expect(result.success).toBe(true);
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireCompanyMock).toHaveBeenCalledWith("user-1");
    expect(rpcMock).toHaveBeenCalledWith("upsert_onboarding_progress", {
      p_company_id: "company-1",
      p_patch: expect.objectContaining({
        completed: true,
        welcome_seen: true,
      }),
    });
  });

  it("usa fallback legado quando upsert falha na conclusão", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "relation missing" } })
      .mockResolvedValueOnce({ data: null, error: null });

    const { completeOnboardingTutorialAction } = await import(
      "@/features/onboarding-tour/actions"
    );
    const result = await completeOnboardingTutorialAction();

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("complete_onboarding_tutorial");
  });
});
