import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const rpcMock = vi.fn();
const getClaimsMock = vi.fn();
const fromMock = vi.fn();
const signUpMock = vi.fn();
const signInMock = vi.fn();
const signOutMock = vi.fn();
const resetPasswordMock = vi.fn();
const resendMock = vi.fn();
const updateUserMock = vi.fn();
const getSiteUrlMock = vi.fn();
const enforceAuthRateLimitMock = vi.fn();
const peekPendingInviteMock = vi.fn();
const resolveAuthLandingPathMock = vi.fn();

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

vi.mock("@/lib/auth/get-site-url", () => ({
  getSiteUrl: () => getSiteUrlMock(),
}));

vi.mock("@/lib/security/enforce-rate-limit", () => ({
  enforceAuthRateLimit: (...args: unknown[]) => enforceAuthRateLimitMock(...args),
  RATE_LIMIT_MESSAGE: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
}));

vi.mock("@/features/employees/access/accept-invite", () => ({
  peekPendingInvite: () => peekPendingInviteMock(),
  resolveAuthLandingPath: () => resolveAuthLandingPathMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
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

describe("runCompleteOnboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    getClaimsMock.mockReset();
    fromMock.mockReset();
    enforceAuthRateLimitMock.mockResolvedValue(null);
    getSiteUrlMock.mockResolvedValue("https://app.petgestor.test");
    peekPendingInviteMock.mockResolvedValue({ found: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retorna erro quando usuário não está autenticado", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/sessão expirou/i);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("retorna erro quando RPC falha", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "authentication_required" },
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/configuração inicial/i);
    }
  });

  it("membership revogada não confirma acesso", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "onboarding_access_revoked" },
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("revoked");
    }
  });

  it("retorna erro quando RPC não retorna company id", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result.ok).toBe(false);
  });

  it("retorna erro quando membership não é legível após RPC", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "company-456", error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "42501", message: "permission denied" },
              }),
            }),
          }),
        }),
      }),
    });

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/confirmar o acesso/i);
    }
  });

  it("retorna sucesso quando RPC e membership ativa estão ok", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "company-456", error: null });
    mockActiveMembership("company-456");

    const { runCompleteOnboarding } = await import("@/features/auth/actions");
    const result = await runCompleteOnboarding("Ana Silva", "Pet Shop", "+5532999999999");

    expect(result).toEqual({ ok: true, companyId: "company-456" });
  });
});

describe("auth actions", () => {
  beforeEach(() => {
    vi.resetModules();
    signUpMock.mockReset();
    signInMock.mockReset();
    resetPasswordMock.mockReset();
    resendMock.mockReset();
    updateUserMock.mockReset();
    getClaimsMock.mockReset();
    enforceAuthRateLimitMock.mockResolvedValue(null);
    getSiteUrlMock.mockResolvedValue("https://app.petgestor.test");
    peekPendingInviteMock.mockResolvedValue({ found: false });
    resolveAuthLandingPathMock.mockResolvedValue("/dashboard");
  });

  it("cadastro inválido retorna mensagem pt-BR", async () => {
    const { signUpAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("fullName", "A");
    form.set("companyName", "Pet");
    form.set("phone", "32999999999");
    form.set("email", "invalido");
    form.set("password", "123");
    form.set("confirmPassword", "123");
    const result = await signUpAction({}, form);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/invalid input|required|expected string/i);
  });

  it("cadastro válido com sessão vai ao dashboard", async () => {
    signUpMock.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    rpcMock.mockResolvedValue({ data: "company-1", error: null });
    mockActiveMembership("company-1");

    const { signUpAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("fullName", "Ana Silva");
    form.set("companyName", "Pet Shop");
    form.set("phone", "(32) 99999-9999");
    form.set("email", "ana@email.com");
    form.set("password", "senha1234");
    form.set("confirmPassword", "senha1234");

    await expect(signUpAction({}, form)).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("cadastro already registered não enumera a conta", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null },
      error: { message: "User already registered", status: 400 },
    });
    const { signUpAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("fullName", "Ana Silva");
    form.set("companyName", "Pet Shop");
    form.set("phone", "(32) 99999-9999");
    form.set("email", "ana@email.com");
    form.set("password", "senha1234");
    form.set("confirmPassword", "senha1234");
    const result = await signUpAction({}, form);
    expect(result.error).toMatch(/não foi possível concluir o cadastro/i);
    expect(result.error?.toLowerCase()).not.toContain("este e-mail já tem conta");
  });

  it("login inválido usa mensagem genérica", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login credentials", status: 400 } });
    const { signInAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@email.com");
    form.set("password", "errada123");
    const result = await signInAction({}, form);
    expect(result.error).toBe("E-mail ou senha incorretos.");
  });

  it("login válido redireciona", async () => {
    signInMock.mockResolvedValue({ error: null });
    resolveAuthLandingPathMock.mockResolvedValue("/dashboard");
    const { signInAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@email.com");
    form.set("password", "senha12345");
    await expect(signInAction({}, form)).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("logout redireciona para entrar", async () => {
    signOutMock.mockResolvedValue({});
    const { signOutAction } = await import("@/features/auth/actions");
    await expect(signOutAction()).rejects.toThrow(/REDIRECT:\/entrar/);
  });

  it("recovery de e-mail existente e inexistente devolve a mesma mensagem", async () => {
    resetPasswordMock.mockResolvedValue({ error: null });
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const existing = new FormData();
    existing.set("email", "existe@email.com");
    const missing = new FormData();
    missing.set("email", "naoexiste@email.com");
    const a = await passwordRecoveryAction({}, existing);
    const b = await passwordRecoveryAction({}, missing);
    expect(a.success).toBe(b.success);
    expect(a.success).toMatch(/se houver uma conta/i);
  });

  it("recovery com erro real do provider mostra indisponibilidade", async () => {
    resetPasswordMock.mockResolvedValue({ error: { status: 503, message: "upstream" } });
    const { passwordRecoveryAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("email", "ana@email.com");
    const result = await passwordRecoveryAction({}, form);
    expect(result.error).toMatch(/temporariamente indisponível/i);
    expect(result.success).toBeUndefined();
  });

  it("reenvio usa a mesma mensagem para e-mail existente e inexistente", async () => {
    resendMock.mockResolvedValue({ error: null });
    const { resendConfirmationAction } = await import("@/features/auth/actions");
    const existing = new FormData();
    existing.set("email", "existe@email.com");
    const missing = new FormData();
    missing.set("email", "naoexiste@email.com");
    const a = await resendConfirmationAction({}, existing);
    const b = await resendConfirmationAction({}, missing);
    expect(a.success).toBe(b.success);
  });

  it("nova senha exige sessão", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });
    const { updatePasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novaSenha1");
    form.set("confirmPassword", "novaSenha1");
    const result = await updatePasswordAction({}, form);
    expect(result.error).toMatch(/sessão expirou/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("nova senha com sessão válida redireciona", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    updateUserMock.mockResolvedValue({ error: null });
    const { updatePasswordAction } = await import("@/features/auth/actions");
    const form = new FormData();
    form.set("password", "novaSenha1");
    form.set("confirmPassword", "novaSenha1");
    await expect(updatePasswordAction({}, form)).rejects.toThrow(/REDIRECT:\/entrar/);
  });
});
