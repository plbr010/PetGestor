import { describe, expect, it } from "vitest";

import { isAllowedEmailConfirmType, resolveAuthCallbackPath } from "@/lib/auth/callback";

describe("resolveAuthCallbackPath", () => {
  it("callback válido redireciona para next interno", () => {
    expect(
      resolveAuthCallbackPath({
        code: "pkce-code",
        next: "/nova-senha",
        exchangeFailed: false,
      }),
    ).toBe("/nova-senha");
  });

  it("callback sem code vai para erro", () => {
    expect(
      resolveAuthCallbackPath({
        code: null,
        next: "/dashboard",
        exchangeFailed: false,
      }),
    ).toBe("/auth/erro?motivo=callback-invalido");
  });

  it("token/código inválido vai para erro", () => {
    expect(
      resolveAuthCallbackPath({
        code: "expired",
        next: "/nova-senha",
        exchangeFailed: true,
      }),
    ).toBe("/auth/erro?motivo=callback-falhou");
  });

  it("rejeita next externo", () => {
    expect(
      resolveAuthCallbackPath({
        code: "ok",
        next: "https://evil.com",
        exchangeFailed: false,
      }),
    ).toBe("/dashboard");
  });
});

describe("isAllowedEmailConfirmType", () => {
  it("aceita tipos de confirmação de e-mail/convite", () => {
    expect(isAllowedEmailConfirmType("email")).toBe(true);
    expect(isAllowedEmailConfirmType("signup")).toBe(true);
    expect(isAllowedEmailConfirmType("invite")).toBe(true);
  });

  it("rejeita recovery e tipos vazios", () => {
    expect(isAllowedEmailConfirmType("recovery")).toBe(false);
    expect(isAllowedEmailConfirmType(null)).toBe(false);
  });
});
