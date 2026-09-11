import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const getClaimsMock = vi.fn();
const fromMock = vi.fn();
const signUpMock = vi.fn();
const signInMock = vi.fn();
const signOutMock = vi.fn();
const resetPasswordMock = vi.fn();
const resendMock = vi.fn();
const updateUserMock = vi.fn();
const enforceRateLimitMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: getClaimsMock,
      signUp: signUpMock,
      signInWithPassword: signInMock,
      signOut: signOutMock,
      resetPasswordForEmail: resetPasswordMock,
      resend: resendMock,
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

vi.mock("@/features/employees/access/accept-invite", () => ({
  peekPendingInvite: vi.fn(async () => ({ found: false, reason: "no_pending_invite" })),
  resolveAuthLandingPath: vi.fn(async () => "/dashboard"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

function mockActiveMembership(companyId: string) {
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { company_id: companyId },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });
}

describe("BLOCO 8 auth actions", () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    getClaimsMock.mockReset();
    fromMock.mockReset();
    signUpMock.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    resetPasswordMock.mockReset();
    resendMock.mockReset();
    updateUserMock.mockReset();
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cadastro inválido retorna mensagem pt-BR", async () => {
    const { signUpAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("fullName", "A");
    form.set("companyName", "Pet");
    form.set("phone", "123");
    form.set("email", "nao-email");
    form.set("password", "123");
    form.set("confirmPassword", "123");

    const result = await signUpAction({}, form);
    expect(result.error).toMatch(/nome|e-mail|senha|telefone/i);
    expect(result.error).not.toMatch(/Invalid|Required|Expected/i);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("cadastro válido com sessão imediata conclui onboarding", async () => {
    signUpMock.mockResolvedValue({
      data: { session: { access_token: "x" }, user: { id: "u1" } },
      error: null,
    });
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "u1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "company-1", error: null });
    mockActiveMembership("company-1");

    const { signUpAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("fullName", "Ana Silva");
    form.set("companyName", "Pet Shop Ana");
    form.set("phone", "(32) 99999-9999");
    form.set("email", "ana@example.com");
    form.set("password", "senha1234");
    form.set("confirmPassword", "senha1234");

    await expect(signUpAction({}, form)).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("login inválido é genérico", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { signInAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@example.com");
    form.set("password", "errada123");
    const result = await signInAction({}, form);
    expect(result.error).toBe("E-mail ou senha incorretos.");
  });

  it("login válido redireciona", async () => {
    signInMock.mockResolvedValue({ error: null });
    const { signInAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@example.com");
    form.set("password", "senha1234");
    await expect(signInAction({}, form)).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("logout redireciona para entrar", async () => {
    signOutMock.mockResolvedValue({ error: null });
    const { signOutAction } = await import("@/features/auth/actions");
    await expect(signOutAction()).rejects.toThrow(/REDIRECT:\/entrar/);
  });

  it("recovery sucesso e e-mail inexistente usam a mesma mensagem", async () => {
    resetPasswordMock.mockResolvedValue({ error: null });
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const { RECOVERY_GENERIC_MESSAGE } = await import("@/features/auth/messages");

    const existing = new FormData();
    existing.set("email", "existe@example.com");
    const missing = new FormData();
    missing.set("email", "naoexiste@example.com");

    expect(await passwordRecoveryAction({}, existing)).toEqual({
      success: RECOVERY_GENERIC_MESSAGE,
    });
    expect(await passwordRecoveryAction({}, missing)).toEqual({
      success: RECOVERY_GENERIC_MESSAGE,
    });
  });

  it("recovery com erro real do provider não finge sucesso", async () => {
    resetPasswordMock.mockResolvedValue({
      error: { message: "smtp down", status: 500, code: "unexpected_failure" },
    });
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const { PROVIDER_UNAVAILABLE_MESSAGE } = await import("@/features/auth/messages");
    const form = new FormData();
    form.set("email", "ana@example.com");
    const result = await passwordRecoveryAction({}, form);
    expect(result.error).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(result.success).toBeUndefined();
  });

  it("reenvio de confirmação é genérico para e-mails existentes e inexistentes", async () => {
    resendMock.mockResolvedValue({ error: null });
    const { resendConfirmationAction } = await import("@/features/auth/actions");
    const { RESEND_GENERIC_MESSAGE } = await import("@/features/auth/messages");

    const a = new FormData();
    a.set("email", "existe@example.com");
    const b = new FormData();
    b.set("email", "naoexiste@example.com");

    expect(await resendConfirmationAction({}, a)).toEqual({ success: RESEND_GENERIC_MESSAGE });
    expect(await resendConfirmationAction({}, b)).toEqual({ success: RESEND_GENERIC_MESSAGE });
  });

  it("nova senha exige sessão", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });
    const { updatePasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    const result = await updatePasswordAction({}, form);
    expect(result.error).toMatch(/sessão expirou/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("nova senha com sessão atualiza e redireciona", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    updateUserMock.mockResolvedValue({ error: null });
    const { updatePasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novasenha1");
    form.set("confirmPassword", "novasenha1");
    await expect(updatePasswordAction({}, form)).rejects.toThrow(/REDIRECT:\/entrar/);
  });

  it("cadastro já existente não revela a conta", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered" },
    });
    const { signUpAction } = await import("@/features/auth/actions");
    const { GENERIC_SIGNUP_MESSAGE } = await import("@/features/auth/messages");
    const form = new FormData();
    form.set("fullName", "Ana Silva");
    form.set("companyName", "Pet Shop Ana");
    form.set("phone", "(32) 99999-9999");
    form.set("email", "ana@example.com");
    form.set("password", "senha1234");
    form.set("confirmPassword", "senha1234");
    const result = await signUpAction({}, form);
    expect(result.error).toBe(GENERIC_SIGNUP_MESSAGE);
    expect(result.error).not.toMatch(/entre em \/entrar/i);
  });

  it("rate limit no login devolve mensagem genérica", async () => {
    enforceRateLimitMock.mockResolvedValue({
      ok: false,
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      retryAfterSeconds: 40,
    });
    const { signInAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@example.com");
    form.set("password", "senha1234");
    const result = await signInAction({}, form);
    expect(result.error).toMatch(/muitas tentativas/i);
    expect(signInMock).not.toHaveBeenCalled();
  });
});
