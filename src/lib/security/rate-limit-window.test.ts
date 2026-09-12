import { describe, expect, it } from "vitest";

import {
  applyRateLimitHit,
  applyRateLimitHitsSequential,
} from "@/lib/security/rate-limit-window";

const WINDOW_MS = 60_000;

describe("applyRateLimitHit", () => {
  it("permite hits abaixo do limite", () => {
    const first = applyRateLimitHit(null, 1_000, 3, WINDOW_MS);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    const second = applyRateLimitHit(first.next, 1_100, 3, WINDOW_MS);
    expect(second.allowed).toBe(true);
    expect(second.next.hitCount).toBe(2);
  });

  it("permite o hit exatamente no limite", () => {
    const result = applyRateLimitHitsSequential(null, 1_000, 3, WINDOW_MS, 3);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.next.hitCount).toBe(3);
  });

  it("bloqueia acima do limite", () => {
    const result = applyRateLimitHitsSequential(null, 1_000, 3, WINDOW_MS, 4);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it("reabre a janela quando o relógio avança", () => {
    const blocked = applyRateLimitHitsSequential(null, 1_000, 2, WINDOW_MS, 3);
    expect(blocked.allowed).toBe(false);

    const afterWindow = applyRateLimitHit(blocked.next, 1_000 + WINDOW_MS, 2, WINDOW_MS);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.next.hitCount).toBe(1);
  });

  it("concorrência serializada mantém o limite", () => {
    let state = applyRateLimitHit(null, 5_000, 2, WINDOW_MS).next;
    const a = applyRateLimitHit(state, 5_000, 2, WINDOW_MS);
    state = a.next;
    const b = applyRateLimitHit(state, 5_000, 2, WINDOW_MS);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);
    expect(b.next.hitCount).toBe(3);
  });

  it("duas leituras do mesmo estado (sem lock) ambas passariam — o reducer encadeado não", () => {
    const current = { windowStartedAtMs: 0, hitCount: 1 };
    const unsyncedA = applyRateLimitHit(current, 10, 2, WINDOW_MS);
    const unsyncedB = applyRateLimitHit(current, 10, 2, WINDOW_MS);
    expect(unsyncedA.allowed).toBe(true);
    expect(unsyncedB.allowed).toBe(true);

    const sequential = applyRateLimitHit(unsyncedA.next, 10, 2, WINDOW_MS);
    expect(sequential.allowed).toBe(false);
  });
});
