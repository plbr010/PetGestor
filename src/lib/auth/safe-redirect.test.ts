import { describe, expect, it } from "vitest";

import { getSafeRedirectPath, isSafeRedirectPath } from "@/lib/auth/safe-redirect";

describe("getSafeRedirectPath", () => {
  it("aceita caminho interno", () => {
    expect(getSafeRedirectPath("/dashboard/agenda")).toBe("/dashboard/agenda");
  });

  it("usa fallback para valor ausente", () => {
    expect(getSafeRedirectPath(undefined, "/entrar")).toBe("/entrar");
  });

  it("bloqueia URL externa", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/dashboard");
  });

  it("bloqueia protocol-relative", () => {
    expect(getSafeRedirectPath("//evil.com")).toBe("/dashboard");
  });

  it("bloqueia caminho com barra invertida", () => {
    expect(getSafeRedirectPath("/path\\evil")).toBe("/dashboard");
  });
});

describe("isSafeRedirectPath", () => {
  it("retorna true para caminho seguro", () => {
    expect(isSafeRedirectPath("/onboarding")).toBe(true);
  });

  it("retorna false para URL externa", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
  });
});
