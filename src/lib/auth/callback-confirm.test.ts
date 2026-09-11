import { describe, expect, it } from "vitest";

import { resolveAuthCallbackRedirect, resolveEmailConfirmLanding } from "@/lib/auth/auth-redirects";
import { getSafeRedirectPath, isSafeRedirectPath } from "@/lib/auth/safe-redirect";

describe("auth callback", () => {
  it("callback válido redireciona para next interno", () => {
    expect(
      resolveAuthCallbackRedirect({
        code: "pkce-code",
        next: "/nova-senha",
        providerError: null,
        exchangeError: false,
      }).redirectTo,
    ).toBe("/nova-senha");
  });

  it("callback sem code vai para erro", () => {
    expect(
      resolveAuthCallbackRedirect({
        code: null,
        next: "/dashboard",
        providerError: null,
        exchangeError: false,
      }).redirectTo,
    ).toBe("/auth/erro?motivo=callback-invalido");
  });

  it("callback com token/código inválido vai para erro", () => {
    expect(
      resolveAuthCallbackRedirect({
        code: "expired",
        next: "/nova-senha",
        providerError: null,
        exchangeError: true,
      }).redirectTo,
    ).toBe("/auth/erro?motivo=callback-falhou");
  });

  it("callback com erro do provider vai para erro", () => {
    expect(
      resolveAuthCallbackRedirect({
        code: "x",
        next: "/dashboard",
        providerError: "access_denied",
        exchangeError: false,
      }).redirectTo,
    ).toBe("/auth/erro?motivo=callback-falhou");
  });
});

describe("open redirect", () => {
  it("rejeita https externo", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
  });

  it("rejeita protocol-relative", () => {
    expect(getSafeRedirectPath("//evil.com")).toBe("/dashboard");
  });

  it("rejeita javascript:", () => {
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejeita next percent-encoded externo", () => {
    expect(getSafeRedirectPath("%2F%2Fevil.com")).toBe("/dashboard");
  });
});

describe("email confirm landing", () => {
  it("staff e convite vão para /convite", () => {
    expect(
      resolveEmailConfirmLanding({
        pendingInvite: true,
        signupMode: "owner",
        onboardingOk: true,
        onboardingRevoked: false,
        next: "/dashboard",
      }),
    ).toBe("/convite");
  });

  it("revogado não cai no dashboard", () => {
    expect(
      resolveEmailConfirmLanding({
        pendingInvite: false,
        signupMode: "owner",
        onboardingOk: false,
        onboardingRevoked: true,
        next: "/dashboard",
      }),
    ).toBe("/dashboard/acesso-revogado");
  });

  it("onboarding ok honra next interno e rejeita externo", () => {
    expect(
      resolveEmailConfirmLanding({
        pendingInvite: false,
        signupMode: "owner",
        onboardingOk: true,
        onboardingRevoked: false,
        next: "/dashboard/agenda",
      }),
    ).toBe("/dashboard/agenda");

    expect(
      resolveEmailConfirmLanding({
        pendingInvite: false,
        signupMode: "owner",
        onboardingOk: true,
        onboardingRevoked: false,
        next: "https://evil.com",
      }),
    ).toContain("/dashboard");
  });
});
