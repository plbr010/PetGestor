import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppUrlConfigError,
  requireAppUrl,
  resolveAppUrlFromRequestHost,
  resolveConfiguredAppUrl,
} from "@/lib/env/resolve-app-url";

describe("resolveConfiguredAppUrl", () => {
  it("prioriza APP_URL sobre NEXT_PUBLIC_APP_URL e VERCEL_URL", () => {
    expect(
      resolveConfiguredAppUrl({
        APP_URL: "https://pet-gestor-sepia.vercel.app/",
        NEXT_PUBLIC_APP_URL: "https://other.example.com",
        VERCEL_URL: "ignored.vercel.app",
      }),
    ).toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("usa NEXT_PUBLIC_APP_URL quando APP_URL está vazia", () => {
    expect(
      resolveConfiguredAppUrl({
        APP_URL: "  ",
        NEXT_PUBLIC_APP_URL: "https://app.example.com/",
      }),
    ).toBe("https://app.example.com");
  });

  it("usa VERCEL_URL com https quando nenhuma APP_URL está setada", () => {
    expect(
      resolveConfiguredAppUrl({
        VERCEL_URL: "pet-gestor-sepia.vercel.app",
      }),
    ).toBe("https://pet-gestor-sepia.vercel.app");
  });
});

describe("resolveAppUrlFromRequestHost", () => {
  it("monta https a partir de x-forwarded na Vercel", () => {
    expect(
      resolveAppUrlFromRequestHost("pet-gestor-sepia.vercel.app", "https"),
    ).toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("usa http para localhost sem proto", () => {
    expect(resolveAppUrlFromRequestHost("localhost:3000", null)).toBe(
      "http://localhost:3000",
    );
  });

  it("assume https quando host público vem sem proto", () => {
    expect(resolveAppUrlFromRequestHost("pet-gestor-sepia.vercel.app", null)).toBe(
      "https://pet-gestor-sepia.vercel.app",
    );
  });
});

describe("requireAppUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("não usa localhost em production sem env", () => {
    expect(() =>
      requireAppUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toThrow(AppUrlConfigError);
  });

  it("permite localhost fora de production", () => {
    expect(
      requireAppUrl({
        NODE_ENV: "development",
      }),
    ).toBe("http://localhost:3000");
  });
});

describe("getSiteUrl", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock("next/headers");
  });

  it("usa APP_URL mesmo sem NEXT_PUBLIC_APP_URL (causa do bug de convite)", async () => {
    vi.stubEnv("APP_URL", "https://pet-gestor-sepia.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("next/headers", () => ({
      headers: async () => ({
        get: () => null,
      }),
    }));

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).resolves.toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("usa headers da Vercel quando env de app não está setada", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("next/headers", () => ({
      headers: async () => ({
        get: (name: string) => {
          if (name === "x-forwarded-host") return "pet-gestor-sepia.vercel.app";
          if (name === "x-forwarded-proto") return "https";
          return null;
        },
      }),
    }));

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).resolves.toBe("https://pet-gestor-sepia.vercel.app");
  });

  it("não cai em localhost em production sem env/headers", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");

    vi.doMock("next/headers", () => ({
      headers: async () => ({
        get: () => null,
      }),
    }));

    const { getSiteUrl, AppUrlConfigError } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).rejects.toBeInstanceOf(AppUrlConfigError);
  });
});
