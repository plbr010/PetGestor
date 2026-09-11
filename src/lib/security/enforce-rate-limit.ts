import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_MESSAGE,
  combineRateLimitDecisions,
  consumeSensitiveActionRateLimit,
  hashRateLimitSubject,
  normalizeRateLimitEmail,
  type SensitiveRateLimitAction,
} from "@/lib/security/rate-limit";

export { RATE_LIMIT_MESSAGE };

async function readClientIp(): Promise<string> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = headerStore.get("x-real-ip")?.trim();
    const cfIp = headerStore.get("cf-connecting-ip")?.trim();
    return forwarded || realIp || cfIp || "unknown";
  } catch {
    return "unknown";
  }
}

async function consumePair(
  emailAction: SensitiveRateLimitAction,
  ipAction: SensitiveRateLimitAction,
  email: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const supabase = await createSupabaseServerClient();
  const ip = await readClientIp();
  const emailHash = hashRateLimitSubject([emailAction, "email", normalizeRateLimitEmail(email)]);
  const ipHash = hashRateLimitSubject([ipAction, "ip", ip]);

  const rpc = (fn: string, args: { p_action: string; p_subject_hash: string }) =>
    supabase.rpc(fn as "consume_sensitive_action_rate_limit", args);

  const [emailDecision, ipDecision] = await Promise.all([
    consumeSensitiveActionRateLimit({ action: emailAction, subjectHash: emailHash, rpc }),
    consumeSensitiveActionRateLimit({ action: ipAction, subjectHash: ipHash, rpc }),
  ]);

  const combined = combineRateLimitDecisions([emailDecision, ipDecision]);
  return {
    allowed: combined.allowed,
    retryAfterSeconds: combined.retryAfterSeconds,
  };
}

export async function enforceAuthRateLimit(
  kind: "login" | "signup" | "recovery" | "resend",
  email: string,
): Promise<{ error: string; retryAfterSeconds?: number } | null> {
  const pair =
    kind === "login"
      ? await consumePair("login_email", "login_ip", email)
      : kind === "signup"
        ? await consumePair("signup_email", "signup_ip", email)
        : kind === "recovery"
          ? await consumePair("recovery_email", "recovery_ip", email)
          : await consumePair("resend_email", "resend_ip", email);

  if (!pair.allowed) {
    return { error: RATE_LIMIT_MESSAGE, retryAfterSeconds: pair.retryAfterSeconds };
  }

  return null;
}

export async function enforceInviteRateLimit(options: {
  companyId: string;
  actorUserId: string;
  email: string;
}): Promise<{ error: string; retryAfterSeconds?: number } | null> {
  const supabase = await createSupabaseServerClient();
  const rpc = (fn: string, args: { p_action: string; p_subject_hash: string }) =>
    supabase.rpc(fn as "consume_sensitive_action_rate_limit", args);

  const actorHash = hashRateLimitSubject([
    "invite_actor",
    options.companyId,
    options.actorUserId,
  ]);
  const emailHash = hashRateLimitSubject([
    "invite_email",
    options.companyId,
    normalizeRateLimitEmail(options.email),
  ]);

  const [actorDecision, emailDecision] = await Promise.all([
    consumeSensitiveActionRateLimit({
      action: "invite_actor",
      subjectHash: actorHash,
      rpc,
    }),
    consumeSensitiveActionRateLimit({
      action: "invite_email",
      subjectHash: emailHash,
      rpc,
    }),
  ]);

  const combined = combineRateLimitDecisions([actorDecision, emailDecision]);
  if (!combined.allowed) {
    return { error: RATE_LIMIT_MESSAGE, retryAfterSeconds: combined.retryAfterSeconds };
  }

  return null;
}
