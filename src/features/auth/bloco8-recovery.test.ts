import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const getClaimsMock = vi.fn();
const fromMock = vi.fn();
const resetPasswordMock = vi.fn();
const updateUserMock = vi.fn();
const enforceRateLimitMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: getClaimsMock,
      resetPasswordForEmail: resetPasswordMock,
      updateUser: updateUserMock,
    },
    rpc: rpcMock,
    from: fromMock,
  })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceAuthRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
  AUTH_RATE_LIMIT_MESSAGE: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
}));

vi.mock("@/lib/auth/get-site-url", () => ({
  getSiteUrl: vi.fn(async () => "https://app.petgestor.test"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import {
  RECOVERY_COOKIE_NAME,
  RECOVERY_INVALID_MESSAGE,
  createMemoryRecoveryCookieAdapter,
  createMemoryRecoveryMarkerStore,
  createOpaqueRecoveryToken,
  hashRecoveryMarkerToken,
  issueRecoveryMarkerCookie,
  recoveryCookieOptions,
  resolveRecoverySecret,
  setRecoveryCookieAdapterForTests,
  setRecoveryMarkerStoreForTests,
  verifyRecoveryTicket,
} from "@/lib/auth/recovery-marker";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/features/auth/messages";
import { logAuthEvent } from "@/lib/security/safe-log";

describe("BLOCO 8 recovery — marker one-time", () => {
  let adapter: ReturnType<typeof createMemoryRecoveryCookieAdapter>;
  let store: ReturnType<typeof createMemoryRecoveryMarkerStore>;

  beforeEach(() => {
    adapter = createMemoryRecoveryCookieAdapter();
    store = createMemoryRecoveryMarkerStore();
    setRecoveryCookieAdapterForTests(adapter);
    setRecoveryMarkerStoreForTests(store);
    rpcMock.mockReset();
    getClaimsMock.mockReset();
    fromMock.mockReset();
    resetPasswordMock.mockReset();
    updateUserMock.mockReset();
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    setRecoveryCookieAdapterForTests(null);
    setRecoveryMarkerStoreForTests(null);
    vi.unstubAllEnvs();
  });

  it("1 — recovery legítimo: ticket no e-mail, marcador válido, troca senha e remove cookie", async () => {
    resetPasswordMock.mockResolvedValue({ error: null });
    const { passwordRecoveryAction, updateRecoveryPasswordAction } = await import(
      "@/features/auth/actions"
    );

    const form = new FormData();
    form.set("email", "ana@example.com");
    const sent = await passwordRecoveryAction({}, form);
    expect(sent.success).toBeTruthy();

    const redirectTo = resetPasswordMock.mock.calls[0]?.[1]?.redirectTo as string;
    expect(redirectTo).toContain("/auth/callback?");
    expect(redirectTo).toContain("flow=recovery");
    expect(redirectTo).toContain("rt=");
    expect(redirectTo).not.toBe("/auth/callback?next=/nova-senha");

    const ticket = new URL(redirectTo).searchParams.get("rt");
    expect(ticket).toBeTruthy();
    expect(verifyRecoveryTicket(ticket!, resolveRecoverySecret())).not.toBeNull();

    await issueRecoveryMarkerCookie("u1");
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    updateUserMock.mockResolvedValue({ error: null });

    const pwd = new FormData();
    pwd.set("password", "novasenha1");
    pwd.set("confirmPassword", "novasenha1");
    await expect(updateRecoveryPasswordAction({}, pwd)).rejects.toThrow(
      "REDIRECT:/entrar?senha-atualizada=1",
    );
    expect(updateUserMock).toHaveBeenCalledWith({ password: "novasenha1" });
    expect(adapter.get(RECOVERY_COOKIE_NAME)).toBeUndefined();
  });

  it("2 — usuário logado normalmente sem marcador é recusado", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("4 — marcador expirado é recusado", async () => {
    const token = createOpaqueRecoveryToken();
    await store.issue({
      userId: "u1",
      tokenHash: hashRecoveryMarkerToken(token),
      expiresAtMs: Date.now() - 1_000,
    });
    adapter.set(RECOVERY_COOKIE_NAME, token, recoveryCookieOptions());
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("5 — marcador adulterado é recusado", async () => {
    await issueRecoveryMarkerCookie("u1");
    adapter.set(RECOVERY_COOKIE_NAME, "adulterado", recoveryCookieOptions());
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("6 — marcador de outro usuário é recusado", async () => {
    await issueRecoveryMarkerCookie("owner");
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "intruder" } }, error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("7/8 — replay: cópia do cookie após consumo é recusada", async () => {
    await issueRecoveryMarkerCookie("u1");
    const copy = adapter.get(RECOVERY_COOKIE_NAME);
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    updateUserMock.mockResolvedValue({ error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    await expect(updateRecoveryPasswordAction({}, form)).rejects.toThrow(
      "REDIRECT:/entrar?senha-atualizada=1",
    );
    expect(adapter.get(RECOVERY_COOKIE_NAME)).toBeUndefined();

    adapter.set(RECOVERY_COOKIE_NAME, copy!, recoveryCookieOptions());
    const reuse = await updateRecoveryPasswordAction({}, form);
    expect(reuse.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("senha inválida NÃO consome o marker", async () => {
    await issueRecoveryMarkerCookie("u1");
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "123");
    form.set("confirmPassword", "123");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBeTruthy();
    expect(updateUserMock).not.toHaveBeenCalled();

    const { peekRecoveryMarkerForUser } = await import("@/lib/auth/recovery-marker");
    expect(await peekRecoveryMarkerForUser("u1")).toBe(true);
  });

  it("provider falha após consumo: marker não é reativado", async () => {
    await issueRecoveryMarkerCookie("u1");
    const copy = adapter.get(RECOVERY_COOKIE_NAME)!;
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    updateUserMock.mockResolvedValue({ error: { message: "weak", status: 400 } });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);

    adapter.set(RECOVERY_COOKIE_NAME, copy, recoveryCookieOptions());
    updateUserMock.mockResolvedValue({ error: null });
    const retry = await updateRecoveryPasswordAction({}, form);
    expect(retry.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("production sem AUTH_RECOVERY_SECRET falha fechado antes do provider", async () => {
    vi.stubEnv("AUTH_RECOVERY_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@example.com");
    const result = await passwordRecoveryAction({}, form);
    expect(result.error).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(result.error).not.toMatch(/AUTH_RECOVERY_SECRET|service.?role|HMAC|migration/i);
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("9 — token/cookie/secret nunca aparece em log", () => {
    const details = {
      token: createOpaqueRecoveryToken(),
      cookie: "pg_pwd_recovery=abc",
      ticket: "signed.ticket",
      secret: VALID_LOOKING_SECRET,
      status: 500,
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthEvent("UpdateRecoveryPassword", details);
    const printed = JSON.stringify(errorSpy.mock.calls);
    expect(printed).not.toContain(details.token);
    expect(printed).not.toContain("pg_pwd_recovery=abc");
    expect(printed).not.toContain("signed.ticket");
    expect(printed).not.toContain(VALID_LOOKING_SECRET);
    expect(printed).toContain("[redacted]");
    errorSpy.mockRestore();
  });
});

const VALID_LOOKING_SECRET = "petgestor-test-recovery-secret-32b!";
