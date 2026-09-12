import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { isSupabaseServiceRoleConfigured } from "@/lib/env/server-env";
import { isProductionRuntime } from "@/lib/env/resolve-app-url";
import { applyRateLimitHit } from "@/lib/security/rate-limit-window";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const AUTH_RATE_LIMIT_MESSAGE =
  "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "Não foi possível processar sua solicitação agora. Tente novamente em instantes.";

/** Espelho da política persistida em private.auth_rate_limit_policy. O RPC ignora estes valores. */
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
  action: AuthRateLimitAction;
  bucketKey: string;
}) => Promise<{ allowed: boolean; retryAfterSeconds: number } | null>;

let consumeImpl: ConsumeRateLimitFn = consumeAuthRateLimitRpc;

/** Permite injetar store nos testes sem sleep real. */
export function setAuthRateLimitConsumerForTests(impl: ConsumeRateLimitFn | null): void {
  consumeImpl = impl ?? consumeAuthRateLimitRpc;
}

type RateLimitRpcResult = {
  data: unknown;
  error: { code?: string; message?: string; status?: number } | null;
};

type RateLimitRpcClient = {
  rpc: (
    fn: "consume_auth_rate_limit",
    args: { p_action: string; p_bucket_key: string },
  ) => PromiseLike<RateLimitRpcResult>;
};

function parseRateLimitRpcResult(input: {
  data: unknown;
  error: { code?: string; message?: string; status?: number } | null;
}): { allowed: boolean; retryAfterSeconds: number } | null {
  const { data, error } = input;

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message?.includes("consume_auth_rate_limit")
    ) {
      if (!isProductionRuntime() && process.env.NODE_ENV === "development") {
        console.info("[rate-limit] rpc unavailable, skipping (development only)");
      }
      return null;
    }

    console.error("[rate-limit] consume failed", {
      code: error.code ?? null,
      status: error.status ?? null,
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

/** Cliente RPC de teste/produção: envia só action + bucket. Política e relógio ficam no banco. */
export function createSupabaseRateLimitConsumer(client: RateLimitRpcClient): ConsumeRateLimitFn {
  return async ({ action, bucketKey }) => {
    const { data, error } = await client.rpc("consume_auth_rate_limit", {
      p_action: action,
      p_bucket_key: bucketKey,
    });
    return parseRateLimitRpcResult({ data, error });
  };
}

async function consumeAuthRateLimitRpc(input: {
  action: AuthRateLimitAction;
  bucketKey: string;
}): Promise<{ allowed: boolean; retryAfterSeconds: number } | null> {
  try {
    if (!isSupabaseServiceRoleConfigured()) {
      return null;
    }

    const admin = createSupabaseAdminClient();
    return await createSupabaseRateLimitConsumer(admin)(input);
  } catch {
    return null;
  }
}

export async function enforceAuthRateLimit(input: {
  action: AuthRateLimitAction;
  email?: string | null;
  companyId?: string | null;
  userId?: string | null;
}): Promise<AuthRateLimitDecision> {
  const headerStore = await headers();
  const ip = readClientIp(headerStore);
  const bucketKey = buildAuthRateLimitKey({
    action: input.action,
    email: input.email,
    companyId: input.companyId,
    userId: input.userId,
    ip,
  });

  const consumed = await consumeImpl({
    action: input.action,
    bucketKey,
  });

  if (consumed === null) {
    // Production: fail-closed — não chama o provider de Auth.
    // Development/test: fail-open documentado para não travar o fluxo local
    // quando a migration ainda não foi aplicada.
    if (isProductionRuntime()) {
      return {
        ok: false,
        error: RATE_LIMIT_UNAVAILABLE_MESSAGE,
        retryAfterSeconds: 60,
      };
    }

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

/** Store em memória só para testes — política vem de AUTH_RATE_LIMITS, não do caller. */
export function createInMemoryRateLimitConsumer(clock?: {
  nowMs: () => number;
}): ConsumeRateLimitFn {
  const buckets = new Map<string, { windowStartedAtMs: number; hitCount: number }>();
  const nowMs = () => clock?.nowMs() ?? Date.now();

  return async ({ action, bucketKey }) => {
    const policy = AUTH_RATE_LIMITS[action];
    if (!policy) {
      throw new Error("política de rate limit desconhecida");
    }

    const current = buckets.get(bucketKey) ?? null;
    const result = applyRateLimitHit(current, nowMs(), policy.limit, policy.windowSeconds * 1000);
    buckets.set(bucketKey, result.next);
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  };
}
