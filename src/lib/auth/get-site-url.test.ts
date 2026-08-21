import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headersMock(...args),
}));

describe("getSiteUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    headersMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefere APP_URL sobre NEXT_PUBLIC_APP_URL", async () => {
    process.env.APP_URL = "https://app.example.com/";
    process.env.NEXT_PUBLIC_APP_URL = "https://public.example.com";
    const { getSiteUrl } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).resolves.toBe("https://app.example.com");
  });

  it("usa NEXT_PUBLIC_APP_URL quando APP_URL falta", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://public.example.com/";
    const { getSiteUrl } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).resolves.toBe("https://public.example.com");
  });

  it("em produção ignora localhost do env e usa host/VERCEL_URL", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.APP_URL = "http://localhost:3000";
    process.env.VERCEL_URL = "petgestor-xxx.vercel.app";
    headersMock.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-forwarded-host") return "petgestor-xxx.vercel.app";
        if (name === "x-forwarded-proto") return "https";
        return null;
      },
    });

    const { getSiteUrl } = await import("@/lib/auth/get-site-url");
    await expect(getSiteUrl()).resolves.toBe("https://petgestor-xxx.vercel.app");
  });

  it("detecta localhost", async () => {
    const { __testables } = await import("@/lib/auth/get-site-url");
    expect(__testables.isLocalhostUrl("http://localhost:3000")).toBe(true);
    expect(__testables.isLocalhostUrl("https://petgestor.vercel.app")).toBe(false);
  });
});
