import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("getCurrentUser email resolution", () => {
  const getClaimsMock = vi.fn();
  const getUserMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getClaimsMock.mockReset();
    getUserMock.mockReset();

    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getClaims: getClaimsMock,
          getUser: getUserMock,
        },
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/supabase/server");
  });

  it("usa email das claims quando disponível", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1", email: "plbrpc@gmail.com" } },
      error: null,
    });

    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "plbrpc@gmail.com",
    });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("faz fallback para getUser quando claims não têm email", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "plbrpc@gmail.com" } },
      error: null,
    });

    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "plbrpc@gmail.com",
    });
    expect(getUserMock).toHaveBeenCalledOnce();
  });
});
