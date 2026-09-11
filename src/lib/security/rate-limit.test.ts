import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "203.0.113.10" : null),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import {
  AUTH_RATE_LIMIT_MESSAGE,
  AUTH_RATE_LIMITS,
  buildAuthRateLimitKey,
  createInMemoryRateLimitConsumer,
  enforceAuthRateLimit,
  hashRateLimitSubject,
  readClientIp,
  setAuthRateLimitConsumerForTests,
} from "@/lib/security/rate-limit";

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

  it("lê o primeiro IP de x-forwarded-for", () => {
    expect(
      readClientIp({
        get: (name) => (name === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2" : null),
      }),
    ).toBe("10.0.0.1");
  });
});

describe("enforceAuthRateLimit", () => {
  afterEach(() => {
    setAuthRateLimitConsumerForTests(null);
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
});
