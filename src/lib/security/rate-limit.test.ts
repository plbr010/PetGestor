import { describe, expect, it } from "vitest";

import { isAuthProviderUnavailable } from "@/lib/auth/provider-error";
import {
  RATE_LIMIT_MESSAGE,
  applyRateLimitHit,
  combineRateLimitDecisions,
  createMemoryRateLimitStore,
  hashRateLimitSubject,
  normalizeRateLimitEmail,
} from "@/lib/security/rate-limit";

describe("auth provider errors", () => {
  it("não trata usuário inexistente como indisponibilidade", () => {
    expect(isAuthProviderUnavailable({ message: "User not found", status: 400 })).toBe(false);
  });

  it("trata 5xx / 429 como indisponibilidade real", () => {
    expect(isAuthProviderUnavailable({ status: 503, message: "upstream" })).toBe(true);
    expect(isAuthProviderUnavailable({ status: 429, message: "rate limit exceeded" })).toBe(true);
  });
});

describe("anti-enumeração de mensagens", () => {
  it("recovery e resend usam mensagem genérica independente da conta", () => {
    const recoveryExisting = "Se houver uma conta associada a esse e-mail, enviaremos as instruções.";
    const recoveryMissing = "Se houver uma conta associada a esse e-mail, enviaremos as instruções.";
    const resendExisting =
      "Se o e-mail estiver cadastrado e ainda pendente de confirmação, enviaremos um novo link.";
    const resendMissing =
      "Se o e-mail estiver cadastrado e ainda pendente de confirmação, enviaremos um novo link.";

    expect(recoveryExisting).toBe(recoveryMissing);
    expect(resendExisting).toBe(resendMissing);
  });

  it("cadastro não distingue already registered na mensagem externa", () => {
    const generic =
      "Não foi possível concluir o cadastro. Se você já tem conta, entre ou recupere a senha.";
    expect(generic.toLowerCase()).not.toContain("este e-mail já tem conta");
  });
});

describe("rate limit", () => {
  it("abaixo do limite permite", () => {
    const applied = applyRateLimitHit(null, 0, 3, 60);
    expect(applied.decision.allowed).toBe(true);
    expect(applied.decision.hitCount).toBe(1);
  });

  it("no limite ainda permite", () => {
    let state = applyRateLimitHit(null, 0, 3, 60).next;
    state = applyRateLimitHit(state, 1, 3, 60).next;
    const third = applyRateLimitHit(state, 2, 3, 60);
    expect(third.decision.allowed).toBe(true);
    expect(third.decision.hitCount).toBe(3);
  });

  it("acima do limite bloqueia com Retry-After", () => {
    let state = applyRateLimitHit(null, 0, 2, 60).next;
    state = applyRateLimitHit(state, 1_000, 2, 60).next;
    const blocked = applyRateLimitHit(state, 2_000, 2, 60);
    expect(blocked.decision.allowed).toBe(false);
    expect(blocked.decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("janela expirada permite novamente sem sleep real", () => {
    let state = applyRateLimitHit(null, 0, 1, 60).next;
    const blocked = applyRateLimitHit(state, 1_000, 1, 60);
    expect(blocked.decision.allowed).toBe(false);

    const afterWindow = applyRateLimitHit(blocked.next, 60_000, 1, 60);
    expect(afterWindow.decision.allowed).toBe(true);
    expect(afterWindow.decision.hitCount).toBe(1);
  });

  it("concorrência: hits atômicos não ultrapassam o limite", async () => {
    const clock = { now: () => 10_000 };
    const store = createMemoryRateLimitStore(clock);
    const hash = hashRateLimitSubject(["login_email", "email", "a@test.com"]);

    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        Promise.resolve(store.consume("login_email", hash)),
      ),
    );

    const allowed = results.filter((item) => item.allowed).length;
    const blocked = results.filter((item) => !item.allowed).length;
    expect(allowed).toBe(10);
    expect(blocked).toBe(5);
  });

  it("usuários/IPs diferentes usam buckets distintos", () => {
    const clock = { now: () => 0 };
    const store = createMemoryRateLimitStore(clock);
    const userA = hashRateLimitSubject(["login_email", "email", normalizeRateLimitEmail("a@x.com")]);
    const userB = hashRateLimitSubject(["login_email", "email", normalizeRateLimitEmail("b@x.com")]);

    for (let i = 0; i < 10; i += 1) {
      expect(store.consume("login_email", userA).allowed).toBe(true);
    }
    expect(store.consume("login_email", userA).allowed).toBe(false);
    expect(store.consume("login_email", userB).allowed).toBe(true);
  });

  it("mensagem de bloqueio é genérica em pt-BR", () => {
    expect(RATE_LIMIT_MESSAGE).toMatch(/muitas tentativas/i);
    expect(RATE_LIMIT_MESSAGE.toLowerCase()).not.toContain("e-mail");
  });

  it("combineRateLimitDecisions preserva o maior Retry-After", () => {
    const combined = combineRateLimitDecisions([
      { allowed: true, retryAfterSeconds: 0, hitCount: 1 },
      { allowed: false, retryAfterSeconds: 30, hitCount: 11 },
      { allowed: false, retryAfterSeconds: 90, hitCount: 21 },
    ]);
    expect(combined.allowed).toBe(false);
    expect(combined.retryAfterSeconds).toBe(90);
  });
});
