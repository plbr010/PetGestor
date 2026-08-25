import { describe, expect, it } from "vitest";

import {
  buildDashboardTrialStartedHref,
  META_CONV_QUERY,
  META_CONV_TRIAL_STARTED,
  readMetaPixelIdFromEnv,
} from "@/lib/analytics/meta-pixel";

describe("Meta Pixel config", () => {
  it("aceita Pixel ID numérico em produção", () => {
    expect(
      readMetaPixelIdFromEnv({
        NEXT_PUBLIC_META_PIXEL_ID: "1060650046671796",
        NODE_ENV: "production",
      }),
    ).toBe("1060650046671796");
  });

  it("não carrega em development por padrão", () => {
    expect(
      readMetaPixelIdFromEnv({
        NEXT_PUBLIC_META_PIXEL_ID: "1060650046671796",
        NODE_ENV: "development",
      }),
    ).toBeNull();
  });

  it("permite debug em development com flag", () => {
    expect(
      readMetaPixelIdFromEnv({
        NEXT_PUBLIC_META_PIXEL_ID: "1060650046671796",
        NEXT_PUBLIC_META_PIXEL_DEBUG: "true",
        NODE_ENV: "development",
      }),
    ).toBe("1060650046671796");
  });

  it("ignora ID inválido ou vazio", () => {
    expect(
      readMetaPixelIdFromEnv({
        NEXT_PUBLIC_META_PIXEL_ID: "",
        NODE_ENV: "production",
      }),
    ).toBeNull();
    expect(
      readMetaPixelIdFromEnv({
        NEXT_PUBLIC_META_PIXEL_ID: "abc",
        NODE_ENV: "production",
      }),
    ).toBeNull();
  });

  it("monta query de conversão trial/registro", () => {
    const href = buildDashboardTrialStartedHref("/dashboard");
    expect(href).toContain(`/dashboard?${META_CONV_QUERY}=${META_CONV_TRIAL_STARTED}`);
  });
});
