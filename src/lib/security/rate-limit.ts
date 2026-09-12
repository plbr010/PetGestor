import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { applyRateLimitHit } from "@/lib/security/rate-limit-window";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const AUTH_RATE_LIMIT_MESSAGE =
  "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export const AUTH_RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 15 * 60 },
  signup: { limit: 5, windowSeconds: 15 * 60 },
  recovery: { limit: 5, windowSeconds: 15 * 60 },
  resend_confirmation: { limit: 3, windowSeconds: 15 * 60 },
  invite: { limit: 10, windowSeconds: 15 * 60 },
  invite_lookup: { limit: 10, windowSeconds: 15 * 60 },
} as const;

export type AuthRateLimitAction = keyof typeof AUTH_RATE_LIMITS;

export type AuthRateLimitDecision =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds: number };

const RATE_LIMIT_SALT = "petgestor-auth-rl-v1";

export function hashRateLimitSubject(parts: Array<string | null | undefined>): string {
  const hash = createHash("sha256");
  hash.update(RATE_LIMIT_SALT);
  for (const part of parts) {
    hash.update("\n");
    hash.update((part ?? "").trim().toLowerCase());
  }
  return hash.digest("hex");
}

export function readClientIp(headerStore: {
  get(name: string): string | null;
}): string {
  const forwarded = headerStore.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  if (firstForwarded) {
    return firstForwarded.slice(0, 128);
  }

  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp.slice(0, 128);
  }

  return "unknown";
}

export function buildAuthRateLimitKey(input: {
  action: AuthRateLimitAction;
  email?: string | null;
  companyId?: string | null;
  userId?: string | null;
  ip: string;
}): string {
  return hashRateLimitSubject([
    input.action,
    input.email ?? "",
    input.companyId ?? "",
    input.userId ?? "",
    input.ip,
  ]);
}

type ConsumeRateLimitFn = (input: {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}) => Promise<{ allowed: boolean; retryAfterSeconds: number } | null>;

let consumeImpl: ConsumeRateLimitFn = consumeAuthRateLimitRpc;

/** Permite injetar relógio/store nos testes sem sleep real. */
export function setAuthRateLimitConsumerForTests(impl: ConsumeRateLimitFn | null): void {
  consumeImpl = impl ?? consumeAuthRateLimitRpc;
}

async function consumeAuthRateLimitRpc(input: {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}): Promise<{ allowed: boolean; retryAfterSeconds: number } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_auth_rate_limit", {
    p_bucket_key: input.bucketKey,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
    p_now: (input.now ?? new Date()).toISOString(),
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message?.includes("consume_auth_rate_limit")
    ) {
      if (process.env.NODE_ENV === "development") {
        console.info("[rate-limit] rpc unavailable, skipping");
      }
      return null;
    }

    console.error("[rate-limit] consume failed", {
      code: error.code ?? null,
      status: "status" in error ? error.status : null,
    });
    return { allowed: false, retryAfterSeconds: 60 };
  }

  const payload = data as {
    allowed?: boolean;
    retry_after_seconds?: number;
  } | null;

  if (!payload || typeof payload.allowed !== "boolean") {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  return {
    allowed: payload.allowed,
    retryAfterSeconds:
      typeof payload.retry_after_seconds === "number" ? payload.retry_after_seconds : 0,
  };
}

export async function enforceAuthRateLimit(input: {
  action: AuthRateLimitAction;
  email?: string | null;
  companyId?: string | null;
  userId?: string | null;
}): Promise<AuthRateLimitDecision> {
  const headerStore = await headers();
  const ip = readClientIp(headerStore);
  const config = AUTH_RATE_LIMITS[input.action];
  const bucketKey = buildAuthRateLimitKey({
    action: input.action,
    email: input.email,
    companyId: input.companyId,
    userId: input.userId,
    ip,
  });

  const consumed = await consumeImpl({
    bucketKey,
    limit: config.limit,
    windowSeconds: config.windowSeconds,
  });

  if (consumed === null) {
    return { ok: true };
  }

  if (!consumed.allowed) {
    return {
      ok: false,
      error: AUTH_RATE_LIMIT_MESSAGE,
      retryAfterSeconds: consumed.retryAfterSeconds,
    };
  }

  return { ok: true };
}

/** Store em memória só para testes — não usar em produção/serverless. */
export function createInMemoryRateLimitConsumer(clock: { nowMs: () => number }): ConsumeRateLimitFn {
  const buckets = new Map<string, { windowStartedAtMs: number; hitCount: number }>();

  return async ({ bucketKey, limit, windowSeconds }) => {
    const nowMs = clock.nowMs();
    const current = buckets.get(bucketKey) ?? null;
    const result = applyRateLimitHit(current, nowMs, limit, windowSeconds * 1000);
    buckets.set(bucketKey, result.next);
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  };
}
