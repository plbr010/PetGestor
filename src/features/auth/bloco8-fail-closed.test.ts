import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const signInMock = vi.fn();
const getClaimsMock = vi.fn();
const resetPasswordMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "203.0.113.10" : null),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: getClaimsMock,
      signInWithPassword: signInMock,
      resetPasswordForEmail: resetPasswordMock,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}));

vi.mock("@/lib/auth/get-site-url", () => ({
  getSiteUrl: vi.fn(async () => "https://app.petgestor.test"),
}));

vi.mock("@/features/employees/access/accept-invite", () => ({
  peekPendingInvite: vi.fn(async () => ({ found: false, reason: "no_pending_invite" })),
  resolveAuthLandingPath: vi.fn(async () => "/dashboard"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

describe("K — RPC ausente em production bloqueia antes do provider", () => {
  beforeEach(async () => {
    const { setAuthRateLimitConsumerForTests } = await import("@/lib/security/rate-limit");
    setAuthRateLimitConsumerForTests(null);
    rpcMock.mockReset();
    signInMock.mockReset();
    getClaimsMock.mockReset();
    resetPasswordMock.mockReset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-not-real");
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.consume_auth_rate_limit" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production + RPC inexistente → não chama signInWithPassword", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const { signInAction } = await import("@/features/auth/actions");
    const { RATE_LIMIT_UNAVAILABLE_MESSAGE } = await import("@/lib/security/rate-limit");

    const form = new FormData();
    form.set("email", "ana@example.com");
    form.set("password", "senha1234");
    const result = await signInAction({}, form);

    expect(result.error).toBe(RATE_LIMIT_UNAVAILABLE_MESSAGE);
    expect(result.error).not.toMatch(/PGRST|consume_auth_rate_limit|Postgres|Supabase|migration/i);
    expect(signInMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalled();
  });

  it("NODE_ENV=production + RPC inexistente → não chama resetPasswordForEmail", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const { RATE_LIMIT_UNAVAILABLE_MESSAGE } = await import("@/lib/security/rate-limit");

    const form = new FormData();
    form.set("email", "ana@example.com");
    const result = await passwordRecoveryAction({}, form);

    expect(result.error).toBe(RATE_LIMIT_UNAVAILABLE_MESSAGE);
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});
