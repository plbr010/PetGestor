import { describe, expect, it, vi, beforeEach } from "vitest";

import { mapProfile } from "@/features/companies/queries";

describe("mapProfile", () => {
  it("mapeia profile completo com tutorial", () => {
    expect(
      mapProfile({
        full_name: "Ana",
        avatar_url: null,
        onboarding_tutorial_completed_at: "2026-08-14T00:00:00.000Z",
      }),
    ).toEqual({
      fullName: "Ana",
      avatarUrl: null,
      onboardingTutorialCompletedAt: "2026-08-14T00:00:00.000Z",
    });
  });

  it("trata tutorial NULL como ainda pendente", () => {
    expect(
      mapProfile({
        full_name: "Ana",
        avatar_url: null,
        onboarding_tutorial_completed_at: null,
      })?.onboardingTutorialCompletedAt,
    ).toBeNull();
  });

  it("quando a coluna do tutorial não existe, não quebra e evita reabrir o tour", () => {
    const profile = mapProfile({
      full_name: "Ana",
      avatar_url: null,
    });

    expect(profile?.fullName).toBe("Ana");
    expect(profile?.onboardingTutorialCompletedAt).toBeTruthy();
  });
});

describe("loadProfileForUser fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("faz fallback para select sem a coluna quando a migration ainda não existe", async () => {
    const maybeSingleTutorial = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column does not exist" },
    });
    const maybeSingleFallback = vi.fn().mockResolvedValue({
      data: { full_name: "Ana", avatar_url: null },
      error: null,
    });

    const eqTutorial = vi.fn(() => ({ maybeSingle: maybeSingleTutorial }));
    const eqFallback = vi.fn(() => ({ maybeSingle: maybeSingleFallback }));
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ eq: eqTutorial }))
      .mockImplementationOnce(() => ({ eq: eqFallback }));

    const supabase = {
      from: vi.fn(() => ({ select })),
    };

    const { loadProfileForUser } = await import("@/features/companies/queries");
    const profile = await loadProfileForUser(supabase as never, "user-1");

    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[0]?.[0]).toContain("onboarding_tutorial_completed_at");
    expect(select.mock.calls[1]?.[0]).toBe("full_name, avatar_url");
    expect(profile).toEqual({
      fullName: "Ana",
      avatarUrl: null,
      onboardingTutorialCompletedAt: "1970-01-01T00:00:00.000Z",
    });
  });
});
