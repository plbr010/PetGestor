import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "203.0.113.10" : null),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import {
  AUTH_RATE_LIMIT_MESSAGE,
  AUTH_RATE_LIMITS,
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
  buildAuthRateLimitKey,
  createInMemoryRateLimitConsumer,
  createSupabaseRateLimitConsumer,
  enforceAuthRateLimit,
  hashRateLimitSubject,
  readClientIp,
  setAuthRateLimitConsumerForTests,
} from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("rate limit keys", () => {
  it("não usa e-mail em claro", () => {
    const key = buildAuthRateLimitKey({
      action: "login",
      email: "ana@example.com",
      ip: "1.1.1.1",
    });

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("ana");
    expect(key).not.toContain("@");
  });

  it("e-mails diferentes geram buckets diferentes", () => {
    const a = hashRateLimitSubject(["login", "a@x.com", "1.1.1.1"]);
    const b = hashRateLimitSubject(["login", "b@x.com", "1.1.1.1"]);
    expect(a).not.toBe(b);
  });

  it("ações diferentes não compartilham bucket", () => {
    const login = buildAuthRateLimitKey({ action: "login", email: "a@x.com", ip: "9.9.9.9" });
    const signup = buildAuthRateLimitKey({ action: "signup", email: "a@x.com", ip: "9.9.9.9" });
    expect(login).not.toBe(signup);
  });

  it("IP diferente muda o hash", () => {
    const a = buildAuthRateLimitKey({ action: "login", email: "ana@pet.com", ip: "127.0.0.1" });
    const b = buildAuthRateLimitKey({ action: "login", email: "ana@pet.com", ip: "10.0.0.2" });
    expect(a).not.toBe(b);
  });

  it("lê o primeiro IP de x-forwarded-for", () => {
    expect(
      readClientIp({
        get: (name) => (name === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2" : null),
      }),
    ).toBe("10.0.0.1");
  });
});

describe("createInMemoryRateLimitConsumer — política no servidor", () => {
  it("A/B — caller não consegue alterar limit nem window", async () => {
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => 1_000 });
    const policy = AUTH_RATE_LIMITS.login;

    for (let i = 0; i < policy.limit; i += 1) {
      const result = await consume({
        action: "login",
        bucketKey: "k-policy",
        // campos extras devem ser ignorados
        ...({ limit: 999, windowSeconds: 1, p_limit: 999, p_window_seconds: 1 } as object),
      });
      expect(result?.allowed).toBe(true);
    }

    const blocked = await consume({
      action: "login",
      bucketKey: "k-policy",
      ...({ limit: 999, windowSeconds: 1 } as object),
    });
    expect(blocked?.allowed).toBe(false);
    expect(blocked?.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked?.retryAfterSeconds).toBeLessThanOrEqual(policy.windowSeconds);
  });

  it("C — caller não passa relógio; janela usa clock interno", async () => {
    let now = 5_000;
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => now });
    const policy = AUTH_RATE_LIMITS.signup;

    for (let i = 0; i < policy.limit; i += 1) {
      await consume({
        action: "signup",
        bucketKey: "k-clock",
        ...({ p_now: "1999-01-01T00:00:00Z", now: 0 } as object),
      });
    }

    expect((await consume({ action: "signup", bucketKey: "k-clock" }))?.allowed).toBe(false);

    now += policy.windowSeconds * 1000 + 50;
    expect((await consume({ action: "signup", bucketKey: "k-clock" }))?.allowed).toBe(true);
  });

  it("D — action inválida falha", async () => {
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => 1 });
    await expect(
      consume({
        action: "not-an-action" as never,
        bucketKey: "k",
      }),
    ).rejects.toThrow(/política de rate limit/i);
  });

  it("E/F/G — login, signup e recovery usam políticas distintas", async () => {
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => 1_000 });

    expect(AUTH_RATE_LIMITS.login.limit).toBe(8);
    expect(AUTH_RATE_LIMITS.signup.limit).toBe(5);
    expect(AUTH_RATE_LIMITS.recovery.limit).toBe(5);

    for (let i = 0; i < 5; i += 1) {
      expect((await consume({ action: "signup", bucketKey: "signup-key" }))?.allowed).toBe(true);
      expect((await consume({ action: "recovery", bucketKey: "recovery-key" }))?.allowed).toBe(true);
    }

    expect((await consume({ action: "signup", bucketKey: "signup-key" }))?.allowed).toBe(false);
    expect((await consume({ action: "recovery", bucketKey: "recovery-key" }))?.allowed).toBe(false);

    for (let i = 0; i < 8; i += 1) {
      expect((await consume({ action: "login", bucketKey: "login-key" }))?.allowed).toBe(true);
    }
    expect((await consume({ action: "login", bucketKey: "login-key" }))?.allowed).toBe(false);
  });

  it("H — concorrência da mesma bucket é atômica", async () => {
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => 1_000 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume({ action: "login", bucketKey: "race" })),
    );
    expect(results.filter((item) => item?.allowed).length).toBe(AUTH_RATE_LIMITS.login.limit);
    expect(results.filter((item) => !item?.allowed).length).toBe(20 - AUTH_RATE_LIMITS.login.limit);
  });

  it("I — janela expira usando o relógio interno (não do caller)", async () => {
    let now = Date.parse("2026-09-11T12:00:00.000Z");
    const consume = createInMemoryRateLimitConsumer({ nowMs: () => now });

    for (let i = 0; i < AUTH_RATE_LIMITS.recovery.limit; i += 1) {
      expect((await consume({ action: "recovery", bucketKey: "window" }))?.allowed).toBe(true);
    }
    expect((await consume({ action: "recovery", bucketKey: "window" }))?.allowed).toBe(false);

    now = Date.parse("2026-09-11T12:14:59.000Z");
    expect((await consume({ action: "recovery", bucketKey: "window" }))?.allowed).toBe(false);

    now = Date.parse("2026-09-11T12:15:00.050Z");
    expect((await consume({ action: "recovery", bucketKey: "window" }))?.allowed).toBe(true);
  });
});

describe("rate limit server-only", () => {
  it("consome via admin client; não usa o client anon/authenticated", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/security/rate-limit.ts"), "utf8");
    expect(source).toContain("createSupabaseAdminClient");
    expect(source).toContain("isSupabaseServiceRoleConfigured");
    expect(source).not.toContain("createSupabaseServerClient");
    expect(source).not.toContain("@/lib/supabase/server");
  });
});

describe("createSupabaseRateLimitConsumer", () => {
  it("A/B/C/J — envia apenas action e bucket; nunca limit, window ou now", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });

    const consume = createSupabaseRateLimitConsumer({ rpc });
    await consume({
      action: "login",
      bucketKey: "hashed-bucket",
    });

    expect(rpc).toHaveBeenCalledWith("consume_auth_rate_limit", {
      p_action: "login",
      p_bucket_key: "hashed-bucket",
    });

    const payload = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["p_action", "p_bucket_key"]);
    expect(payload).not.toHaveProperty("p_limit");
    expect(payload).not.toHaveProperty("p_window_seconds");
    expect(payload).not.toHaveProperty("p_now");
  });
});

describe("enforceAuthRateLimit", () => {
  afterEach(() => {
    setAuthRateLimitConsumerForTests(null);
    vi.unstubAllEnvs();
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  it("permite abaixo do limite e bloqueia acima, sem sleep", async () => {
    const clock = { nowMs: () => 1_000 };
    setAuthRateLimitConsumerForTests(createInMemoryRateLimitConsumer(clock));

    const limit = AUTH_RATE_LIMITS.login.limit;
    for (let i = 0; i < limit; i += 1) {
      const allowed = await enforceAuthRateLimit({ action: "login", email: "a@x.com" });
      expect(allowed.ok).toBe(true);
    }

    const blocked = await enforceAuthRateLimit({ action: "login", email: "a@x.com" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toBe(AUTH_RATE_LIMIT_MESSAGE);
    }
  });

  it("usuários/IPs diferentes usam buckets distintos", async () => {
    const clock = { nowMs: () => 1_000 };
    setAuthRateLimitConsumerForTests(createInMemoryRateLimitConsumer(clock));

    const first = await enforceAuthRateLimit({ action: "login", email: "a@x.com" });
    const other = await enforceAuthRateLimit({ action: "login", email: "b@x.com" });
    expect(first.ok).toBe(true);
    expect(other.ok).toBe(true);
  });

  it("janela expirada libera de novo", async () => {
    let now = 0;
    setAuthRateLimitConsumerForTests(createInMemoryRateLimitConsumer({ nowMs: () => now }));

    const limit = AUTH_RATE_LIMITS.recovery.limit;
    for (let i = 0; i <= limit; i += 1) {
      await enforceAuthRateLimit({ action: "recovery", email: "a@x.com" });
    }

    const blocked = await enforceAuthRateLimit({ action: "recovery", email: "a@x.com" });
    expect(blocked.ok).toBe(false);

    now = AUTH_RATE_LIMITS.recovery.windowSeconds * 1000;
    const allowed = await enforceAuthRateLimit({ action: "recovery", email: "a@x.com" });
    expect(allowed.ok).toBe(true);
  });

  it("K — em production, RPC inexistente falha fechado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-not-real");
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      }),
    } as never);

    const result = await enforceAuthRateLimit({ action: "login", email: "ana@pet.com" });
    expect(result).toEqual({
      ok: false,
      retryAfterSeconds: 60,
      error: RATE_LIMIT_UNAVAILABLE_MESSAGE,
    });
  });

  it("em production, service-role ausente falha fechado sem chamar Auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const result = await enforceAuthRateLimit({ action: "login", email: "ana@pet.com" });
    expect(result).toEqual({
      ok: false,
      retryAfterSeconds: 60,
      error: RATE_LIMIT_UNAVAILABLE_MESSAGE,
    });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("em development/test, RPC ausente ainda permite (fail-open documentado)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-not-real");
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      }),
    } as never);

    const result = await enforceAuthRateLimit({ action: "login", email: "ana@pet.com" });
    expect(result).toEqual({ ok: true });
  });

  it("devolve ok quando o consumidor autoriza", async () => {
    setAuthRateLimitConsumerForTests(async () => ({ allowed: true, retryAfterSeconds: 0 }));
    const result = await enforceAuthRateLimit({
      action: "login",
      email: "ana@pet.com",
    });
    expect(result).toEqual({ ok: true });
  });

  it("bloqueia com mensagem genérica quando o consumidor recusa", async () => {
    setAuthRateLimitConsumerForTests(async () => ({ allowed: false, retryAfterSeconds: 42 }));
    const result = await enforceAuthRateLimit({
      action: "signup",
      email: "ana@pet.com",
    });
    expect(result).toEqual({
      ok: false,
      retryAfterSeconds: 42,
      error: AUTH_RATE_LIMIT_MESSAGE,
    });
  });
});
