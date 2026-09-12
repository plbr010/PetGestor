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
  RECOVERY_MARKER_TTL_SECONDS,
  createMemoryRecoveryCookieAdapter,
  createRecoveryMarker,
  recoveryCookieOptions,
  resolveRecoverySecret,
  setRecoveryCookieAdapterForTests,
  verifyRecoveryTicket,
} from "@/lib/auth/recovery-marker";
import { logAuthEvent } from "@/lib/security/safe-log";

describe("BLOCO 8 recovery — marcador server-side", () => {
  let adapter: ReturnType<typeof createMemoryRecoveryCookieAdapter>;

  beforeEach(() => {
    adapter = createMemoryRecoveryCookieAdapter();
    setRecoveryCookieAdapterForTests(adapter);
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

    const secret = resolveRecoverySecret();
    adapter.set(
      RECOVERY_COOKIE_NAME,
      createRecoveryMarker("u1", secret),
      recoveryCookieOptions(),
    );
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
    const expired = createRecoveryMarker(
      "u1",
      resolveRecoverySecret(),
      Date.now() - (RECOVERY_MARKER_TTL_SECONDS + 30) * 1000,
    );
    adapter.set(RECOVERY_COOKIE_NAME, expired, recoveryCookieOptions());
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
    const valid = createRecoveryMarker("u1", resolveRecoverySecret());
    adapter.set(RECOVERY_COOKIE_NAME, `${valid.slice(0, -3)}zzz`, recoveryCookieOptions());
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
    adapter.set(
      RECOVERY_COOKIE_NAME,
      createRecoveryMarker("owner", resolveRecoverySecret()),
      recoveryCookieOptions(),
    );
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "intruder" } }, error: null });

    const { updateRecoveryPasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updateRecoveryPasswordAction({}, form);
    expect(result.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("7/8 — após sucesso o marcador some e reutilização é recusada", async () => {
    adapter.set(
      RECOVERY_COOKIE_NAME,
      createRecoveryMarker("u1", resolveRecoverySecret()),
      recoveryCookieOptions(),
    );
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

    const reuse = await updateRecoveryPasswordAction({}, form);
    expect(reuse.error).toBe(RECOVERY_INVALID_MESSAGE);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("9 — token/cookie nunca aparece em log", () => {
    const details = {
      token: createRecoveryMarker("u1", resolveRecoverySecret()),
      cookie: "pg_pwd_recovery=abc",
      ticket: "signed.ticket",
      status: 500,
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthEvent("UpdateRecoveryPassword", details);
    const printed = JSON.stringify(errorSpy.mock.calls);
    expect(printed).not.toContain(details.token);
    expect(printed).not.toContain("pg_pwd_recovery=abc");
    expect(printed).not.toContain("signed.ticket");
    expect(printed).toContain("[redacted]");
    errorSpy.mockRestore();
  });
});

