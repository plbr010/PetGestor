import { describe, expect, it } from "vitest";

import { AppUrlConfigError } from "@/lib/env/resolve-app-url";
import {
  getMetadataBase,
  getMetadataBaseUrl,
  tryGetMetadataBaseUrl,
} from "@/lib/seo/metadata-base";

describe("metadata base URL", () => {
  it("A. development/test sem URL configurada permite localhost", () => {
    expect(getMetadataBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(tryGetMetadataBaseUrl({ NODE_ENV: "test" })).toBe("http://localhost:3000");
    expect(getMetadataBase({ NODE_ENV: "development" })?.href).toBe("http://localhost:3000/");
  });

  it("B. production com APP_URL usa a URL configurada", () => {
    expect(
      getMetadataBaseUrl({
        NODE_ENV: "production",
        APP_URL: "https://app.example.com/",
      }),
    ).toBe("https://app.example.com");
    expect(
      getMetadataBase({
        NODE_ENV: "production",
        APP_URL: "https://app.example.com",
      })?.href,
    ).toBe("https://app.example.com/");
  });

  it("C. production com NEXT_PUBLIC_APP_URL usa a URL pública", () => {
    expect(
      getMetadataBaseUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://www.example.com/",
      }),
    ).toBe("https://www.example.com");
  });

  it("D. Vercel com VERCEL_URL gera https correta", () => {
    expect(
      getMetadataBaseUrl({
        NODE_ENV: "production",
        VERCEL_URL: "petgestor.vercel.app",
      }),
    ).toBe("https://petgestor.vercel.app");
    expect(
      tryGetMetadataBaseUrl({
        VERCEL_ENV: "production",
        VERCEL_URL: "https://petgestor.vercel.app/",
      }),
    ).toBe("https://petgestor.vercel.app");
  });

  it("E. production sem nenhuma URL falha fechado e nunca usa localhost", () => {
    const productionEnv = { NODE_ENV: "production" };
    expect(() => getMetadataBaseUrl(productionEnv)).toThrow(AppUrlConfigError);
    expect(tryGetMetadataBaseUrl(productionEnv)).toBeUndefined();
    expect(tryGetMetadataBaseUrl({ VERCEL_ENV: "production" })).toBeUndefined();
    expect(getMetadataBase(productionEnv)).toBeUndefined();
    expect(tryGetMetadataBaseUrl(productionEnv) ?? "").not.toMatch(/localhost/);
  });

  it("prioriza APP_URL e não inventa domínio", () => {
    expect(
      getMetadataBaseUrl({
        APP_URL: "https://app.example.com/",
        NEXT_PUBLIC_APP_URL: "https://other.example.com",
        VERCEL_URL: "ignored.vercel.app",
      }),
    ).toBe("https://app.example.com");
  });
});
