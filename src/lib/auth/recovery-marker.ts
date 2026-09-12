import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { isProductionRuntime } from "@/lib/env/resolve-app-url";

export const RECOVERY_COOKIE_NAME = "pg_pwd_recovery";
export const RECOVERY_TICKET_TTL_SECONDS = 60 * 60;
export const RECOVERY_MARKER_TTL_SECONDS = 15 * 60;
export const RECOVERY_COOKIE_PATH = "/nova-senha";

export const RECOVERY_INVALID_MESSAGE =
  "Link de recuperação inválido ou expirado. Solicite um novo e-mail.";

type RecoveryTicketPayload = {
  typ: "recovery_ticket";
  n: string;
  exp: number;
};

type RecoveryMarkerPayload = {
  typ: "recovery_marker";
  sub: string;
  jti: string;
  exp: number;
};

export type RecoveryCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

export type RecoveryCookieAdapter = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: RecoveryCookieOptions): void;
  delete(name: string, path: string): void;
};

let cookieAdapterOverride: RecoveryCookieAdapter | null = null;

export function setRecoveryCookieAdapterForTests(adapter: RecoveryCookieAdapter | null): void {
  cookieAdapterOverride = adapter;
}

export function createMemoryRecoveryCookieAdapter(): RecoveryCookieAdapter {
  const store = new Map<string, string>();
  return {
    get: (name) => store.get(name),
    set: (name, value) => {
      store.set(name, value);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

async function getCookieAdapter(): Promise<RecoveryCookieAdapter> {
  if (cookieAdapterOverride) {
    return cookieAdapterOverride;
  }

  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => {
      store.set({
        name,
        value,
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
        path: options.path,
        maxAge: options.maxAge,
      });
    },
    delete: (name, path) => {
      store.delete({ name, path });
    },
  };
}

export function resolveRecoverySecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env.AUTH_RECOVERY_SECRET?.trim();
  if (explicit) {
    return explicit;
  }

  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) {
    return `petgestor-recovery-v1:${serviceRole}`;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    return `petgestor-recovery-v1:${supabaseUrl}`;
  }

  if (isProductionRuntime(env)) {
    throw new Error("recovery_secret_unconfigured");
  }

  return "petgestor-recovery-dev";
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signEncoded(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function signRecoveryPayload(
  payload: RecoveryTicketPayload | RecoveryMarkerPayload,
  secret: string,
): string {
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = signEncoded(encoded, secret);
  return `${encoded}.${signature}`;
}

function readSignedPayload(token: string, secret: string): unknown | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [encoded, signature] = parts;
  const expected = signEncoded(encoded, secret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function createRecoveryTicket(
  secret: string,
  nowMs = Date.now(),
): string {
  const payload: RecoveryTicketPayload = {
    typ: "recovery_ticket",
    n: randomBytes(16).toString("hex"),
    exp: Math.floor(nowMs / 1000) + RECOVERY_TICKET_TTL_SECONDS,
  };
  return signRecoveryPayload(payload, secret);
}

export function verifyRecoveryTicket(
  token: string,
  secret: string,
  nowMs = Date.now(),
): RecoveryTicketPayload | null {
  const payload = readSignedPayload(token, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const ticket = payload as Partial<RecoveryTicketPayload>;
  if (ticket.typ !== "recovery_ticket" || typeof ticket.n !== "string" || typeof ticket.exp !== "number") {
    return null;
  }

  if (ticket.exp * 1000 <= nowMs) {
    return null;
  }

  return ticket as RecoveryTicketPayload;
}

export function createRecoveryMarker(
  userId: string,
  secret: string,
  nowMs = Date.now(),
): string {
  const payload: RecoveryMarkerPayload = {
    typ: "recovery_marker",
    sub: userId,
    jti: randomBytes(16).toString("hex"),
    exp: Math.floor(nowMs / 1000) + RECOVERY_MARKER_TTL_SECONDS,
  };
  return signRecoveryPayload(payload, secret);
}

export function verifyRecoveryMarker(
  token: string,
  userId: string,
  secret: string,
  nowMs = Date.now(),
): RecoveryMarkerPayload | null {
  const payload = readSignedPayload(token, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const marker = payload as Partial<RecoveryMarkerPayload>;
  if (
    marker.typ !== "recovery_marker" ||
    typeof marker.sub !== "string" ||
    typeof marker.jti !== "string" ||
    typeof marker.exp !== "number"
  ) {
    return null;
  }

  if (marker.sub !== userId) {
    return null;
  }

  if (marker.exp * 1000 <= nowMs) {
    return null;
  }

  return marker as RecoveryMarkerPayload;
}

export function recoveryCookieOptions(): RecoveryCookieOptions {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: RECOVERY_COOKIE_PATH,
    maxAge: RECOVERY_MARKER_TTL_SECONDS,
  };
}

export async function issueRecoveryMarkerCookie(userId: string): Promise<void> {
  const adapter = await getCookieAdapter();
  const token = createRecoveryMarker(userId, resolveRecoverySecret());
  adapter.set(RECOVERY_COOKIE_NAME, token, recoveryCookieOptions());
}

export async function peekRecoveryMarkerForUser(userId: string): Promise<boolean> {
  const adapter = await getCookieAdapter();
  const token = adapter.get(RECOVERY_COOKIE_NAME);
  if (!token) {
    return false;
  }

  return Boolean(verifyRecoveryMarker(token, userId, resolveRecoverySecret()));
}

export async function clearRecoveryMarkerCookie(): Promise<void> {
  const adapter = await getCookieAdapter();
  adapter.delete(RECOVERY_COOKIE_NAME, RECOVERY_COOKIE_PATH);
}

export function buildRecoveryCallbackPath(ticket: string): string {
  const params = new URLSearchParams({
    flow: "recovery",
    rt: ticket,
  });
  return `/auth/callback?${params.toString()}`;
}
