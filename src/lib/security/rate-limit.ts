import { createHash } from "node:crypto";

export const RATE_LIMIT_MESSAGE =
  "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export type SensitiveRateLimitAction =
  | "login_email"
  | "login_ip"
  | "signup_email"
  | "signup_ip"
  | "recovery_email"
  | "recovery_ip"
  | "resend_email"
  | "resend_ip"
  | "invite_actor"
  | "invite_email";

export const RATE_LIMIT_POLICIES: Record<
  SensitiveRateLimitAction,
  { maxHits: number; windowSeconds: number }
> = {
  login_email: { maxHits: 10, windowSeconds: 900 },
  login_ip: { maxHits: 20, windowSeconds: 900 },
  signup_email: { maxHits: 5, windowSeconds: 900 },
  signup_ip: { maxHits: 10, windowSeconds: 900 },
  recovery_email: { maxHits: 5, windowSeconds: 900 },
  recovery_ip: { maxHits: 10, windowSeconds: 900 },
  resend_email: { maxHits: 5, windowSeconds: 900 },
  resend_ip: { maxHits: 10, windowSeconds: 900 },
  invite_actor: { maxHits: 20, windowSeconds: 900 },
  invite_email: { maxHits: 10, windowSeconds: 900 },
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  hitCount: number;
};

export type RateLimitBucketState = {
  windowStartedAtMs: number;
  windowSeconds: number;
  hitCount: number;
};

/**
 * Janela fixa atômica (espelha o UPSERT SQL).
 * Testável com relógio injetado — sem sleep real.
 */
export function applyRateLimitHit(
  previous: RateLimitBucketState | null,
  nowMs: number,
  maxHits: number,
  windowSeconds: number,
): { next: RateLimitBucketState; decision: RateLimitDecision } {
  const windowExpired =
    previous == null || nowMs >= previous.windowStartedAtMs + previous.windowSeconds * 1000;

  const next: RateLimitBucketState = windowExpired
    ? { windowStartedAtMs: nowMs, windowSeconds, hitCount: 1 }
    : {
        windowStartedAtMs: previous.windowStartedAtMs,
        windowSeconds,
        hitCount: previous.hitCount + 1,
      };

  const allowed = next.hitCount <= maxHits;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(
        0,
        Math.ceil((next.windowStartedAtMs + next.windowSeconds * 1000 - nowMs) / 1000),
      );

  return {
    next,
    decision: {
      allowed,
      retryAfterSeconds,
      hitCount: next.hitCount,
    },
  };
}

export function hashRateLimitSubject(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

export function normalizeRateLimitEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ConsumeRateLimitFn = (
  action: SensitiveRateLimitAction,
  subjectHash: string,
) => Promise<RateLimitDecision>;

function parseRpcDecision(data: unknown): RateLimitDecision | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") {
    return null;
  }

  return {
    allowed: record.allowed,
    retryAfterSeconds:
      typeof record.retry_after_seconds === "number" ? record.retry_after_seconds : 0,
    hitCount: typeof record.hit_count === "number" ? record.hit_count : 0,
  };
}

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("consume_sensitive_action_rate_limit")
  );
}

export async function consumeSensitiveActionRateLimit(options: {
  action: SensitiveRateLimitAction;
  subjectHash: string;
  rpc: (fn: string, args: { p_action: string; p_subject_hash: string }) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}): Promise<RateLimitDecision> {
  const { data, error } = await options.rpc("consume_sensitive_action_rate_limit", {
    p_action: options.action,
    p_subject_hash: options.subjectHash,
  });

  if (error) {
    if (isMissingRpcError(error) && process.env.NODE_ENV !== "production") {
      return { allowed: true, retryAfterSeconds: 0, hitCount: 0 };
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[rate-limit] rpc_error", { action: options.action, code: error.code ?? null });
    }

    // Função ausente em produção: não derruba login; o limite nativo do Auth permanece.
    if (isMissingRpcError(error)) {
      return { allowed: true, retryAfterSeconds: 0, hitCount: 0 };
    }

    return { allowed: true, retryAfterSeconds: 0, hitCount: 0 };
  }

  return parseRpcDecision(data) ?? { allowed: true, retryAfterSeconds: 0, hitCount: 0 };
}

export function combineRateLimitDecisions(
  decisions: RateLimitDecision[],
): RateLimitDecision {
  const blocked = decisions.filter((item) => !item.allowed);
  if (blocked.length === 0) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      hitCount: Math.max(0, ...decisions.map((item) => item.hitCount)),
    };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((item) => item.retryAfterSeconds)),
    hitCount: Math.max(...blocked.map((item) => item.hitCount)),
  };
}

/** Store em memória para testes de concorrência/janela — não usar em produção. */
export function createMemoryRateLimitStore(clock: { now: () => number }) {
  const buckets = new Map<string, RateLimitBucketState>();

  return {
    consume(action: SensitiveRateLimitAction, subjectHash: string): RateLimitDecision {
      const policy = RATE_LIMIT_POLICIES[action];
      const key = `${action}:${subjectHash}`;
      const applied = applyRateLimitHit(buckets.get(key) ?? null, clock.now(), policy.maxHits, policy.windowSeconds);
      buckets.set(key, applied.next);
      return applied.decision;
    },
    reset() {
      buckets.clear();
    },
  };
}
