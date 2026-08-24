import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveConfiguredAppUrl / getAppUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preferência APP_URL sobre NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("APP_URL", "https://pet-gestor-sepia.vercel.app/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const { resolveConfiguredAppUrl, getAppUrl } = await import("@/lib/env/app-url");

    expect(resolveConfiguredAppUrl()).toBe("https://pet-gestor-sepia.vercel.app");
    expect(getAppUrl()).toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("usa NEXT_PUBLIC_APP_URL quando APP_URL ausente", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://pet-gestor-sepia.vercel.app");

    const { resolveConfiguredAppUrl } = await import("@/lib/env/app-url");

    expect(resolveConfiguredAppUrl()).toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("em produção, ignora localhost nas envs e usa VERCEL_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3000");
    vi.stubEnv("VERCEL_URL", "pet-gestor-sepia.vercel.app");

    const { resolveConfiguredAppUrl, getAppUrl } = await import("@/lib/env/app-url");

    expect(resolveConfiguredAppUrl()).toBe("https://pet-gestor-sepia.vercel.app");
    expect(getAppUrl()).toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("em desenvolvimento, permite localhost como fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_URL", "");

    const { resolveConfiguredAppUrl, getAppUrl } = await import("@/lib/env/app-url");

    expect(resolveConfiguredAppUrl()).toBeUndefined();
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("em desenvolvimento, honra APP_URL localhost explícita", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "");

    const { resolveConfiguredAppUrl } = await import("@/lib/env/app-url");

    expect(resolveConfiguredAppUrl()).toBe("http://localhost:3000");
  });
});

describe("getSiteUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("next/headers");
  });

  it("usa APP_URL mesmo quando headers apontam para localhost", async () => {
    vi.stubEnv("APP_URL", "https://pet-gestor-sepia.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          host: "localhost:3000",
          "x-forwarded-proto": "http",
        }),
    }));

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");

    await expect(getSiteUrl()).resolves.toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("sem env, usa host da request em desenvolvimento", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          host: "localhost:3000",
          "x-forwarded-proto": "http",
        }),
    }));

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");

    await expect(getSiteUrl()).resolves.toBe("http://localhost:3000");
  });

  it("em Vercel sem APP_URL, usa VERCEL_URL e não localhost dos headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "pet-gestor-sepia.vercel.app");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          host: "localhost:3000",
        }),
    }));

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");

    await expect(getSiteUrl()).resolves.toBe("https://pet-gestor-sepia.vercel.app");
  });
});
