export type RateLimitWindowState = {
  windowStartedAtMs: number;
  hitCount: number;
};

export type RateLimitHitResult = {
  next: RateLimitWindowState;
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Redutor de janela fixa. A atomicidade real está no UPSERT + advisory lock do Postgres.
 * Testes usam este helper com relógio injetável — sem sleep.
 */
export function applyRateLimitHit(
  current: RateLimitWindowState | null,
  nowMs: number,
  limit: number,
  windowMs: number,
): RateLimitHitResult {
  const expired =
    current === null || nowMs - current.windowStartedAtMs >= windowMs;

  const next: RateLimitWindowState = expired
    ? { windowStartedAtMs: nowMs, hitCount: 1 }
    : { windowStartedAtMs: current.windowStartedAtMs, hitCount: current.hitCount + 1 };

  const allowed = next.hitCount <= limit;
  const elapsedMs = nowMs - next.windowStartedAtMs;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(0, Math.ceil((windowMs - elapsedMs) / 1000));

  return {
    next,
    allowed,
    remaining: Math.max(0, limit - next.hitCount),
    retryAfterSeconds,
  };
}

export function applyRateLimitHitsSequential(
  current: RateLimitWindowState | null,
  nowMs: number,
  limit: number,
  windowMs: number,
  hits: number,
): RateLimitHitResult {
  let state = current;
  let last: RateLimitHitResult | null = null;

  for (let i = 0; i < hits; i += 1) {
    last = applyRateLimitHit(state, nowMs, limit, windowMs);
    state = last.next;
  }

  if (!last) {
    throw new Error("hits must be >= 1");
  }

  return last;
}
