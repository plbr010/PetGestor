import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { isProductionRuntime } from "@/lib/env/resolve-app-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const RECOVERY_COOKIE_NAME = "pg_pwd_recovery";
export const RECOVERY_TICKET_TTL_SECONDS = 60 * 60;
export const RECOVERY_MARKER_TTL_SECONDS = 15 * 60;
export const RECOVERY_COOKIE_PATH = "/nova-senha";
export const RECOVERY_SECRET_MIN_BYTES = 32;

export const RECOVERY_INVALID_MESSAGE =
  "Link de recuperação inválido ou expirado. Solicite um novo e-mail.";

export class RecoverySecretConfigError extends Error {
  constructor() {
    super("recovery_secret_unconfigured");
    this.name = "RecoverySecretConfigError";
  }
}

type RecoveryTicketPayload = {
  typ: "recovery_ticket";
  n: string;
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

export type RecoveryMarkerStore = {
  issue(input: { userId: string; tokenHash: string; expiresAtMs: number }): Promise<void>;
  peek(input: { userId: string; tokenHash: string; nowMs?: number }): Promise<boolean>;
  consume(input: { userId: string; tokenHash: string; nowMs?: number }): Promise<boolean>;
};

let cookieAdapterOverride: RecoveryCookieAdapter | null = null;
let markerStoreOverride: RecoveryMarkerStore | null = null;

export function setRecoveryCookieAdapterForTests(adapter: RecoveryCookieAdapter | null): void {
  cookieAdapterOverride = adapter;
}

export function setRecoveryMarkerStoreForTests(store: RecoveryMarkerStore | null): void {
  markerStoreOverride = store;
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

export function createMemoryRecoveryMarkerStore(clock?: {
  nowMs: () => number;
}): RecoveryMarkerStore {
  const rows = new Map<
    string,
    { userId: string; expiresAtMs: number; consumedAtMs: number | null }
  >();
  const nowMs = () => clock?.nowMs() ?? Date.now();

  return {
    async issue({ userId, tokenHash, expiresAtMs }) {
      const at = nowMs();
      for (const row of rows.values()) {
        if (row.userId === userId && row.consumedAtMs == null) {
          row.consumedAtMs = at;
        }
      }
      rows.set(tokenHash, { userId, expiresAtMs, consumedAtMs: null });
    },
    async peek({ userId, tokenHash, nowMs: at }) {
      const row = rows.get(tokenHash);
      const t = at ?? nowMs();
      return Boolean(
        row && row.userId === userId && row.consumedAtMs == null && row.expiresAtMs > t,
      );
    },
    async consume({ userId, tokenHash, nowMs: at }) {
      const row = rows.get(tokenHash);
      const t = at ?? nowMs();
      if (!row || row.userId !== userId || row.consumedAtMs != null || row.expiresAtMs <= t) {
        return false;
      }
      row.consumedAtMs = t;
      return true;
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

function createSupabaseRecoveryMarkerStore(): RecoveryMarkerStore {
  return {
    async issue({ userId, tokenHash, expiresAtMs }) {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.rpc("issue_password_recovery_marker", {
        p_user_id: userId,
        p_token_hash: tokenHash,
        p_expires_at: new Date(expiresAtMs).toISOString(),
      });
      if (error) {
        throw error;
      }
    },
    async peek({ userId, tokenHash }) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("peek_password_recovery_marker", {
        p_user_id: userId,
        p_token_hash: tokenHash,
      });
      if (error) {
        return false;
      }
      return data === true;
    },
    async consume({ userId, tokenHash }) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("consume_password_recovery_marker", {
        p_user_id: userId,
        p_token_hash: tokenHash,
      });
      if (error) {
        return false;
      }
      return data === true;
    },
  };
}

function getMarkerStore(): RecoveryMarkerStore {
  return markerStoreOverride ?? createSupabaseRecoveryMarkerStore();
}

/**
 * Segredo dedicado. Nunca deriva de variável pública do browser nem da service role.
 * Production e demais ambientes: AUTH_RECOVERY_SECRET com ≥ 32 bytes.
 */
export function resolveRecoverySecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env.AUTH_RECOVERY_SECRET?.trim();
  if (explicit && Buffer.byteLength(explicit, "utf8") >= RECOVERY_SECRET_MIN_BYTES) {
    return explicit;
  }

  throw new RecoverySecretConfigError();
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signEncoded(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function signRecoveryPayload(payload: RecoveryTicketPayload, secret: string): string {
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

export function createRecoveryTicket(secret: string, nowMs = Date.now()): string {
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

export function createOpaqueRecoveryToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRecoveryMarkerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

export async function issueRecoveryMarkerCookie(
  userId: string,
  nowMs = Date.now(),
): Promise<void> {
  const adapter = await getCookieAdapter();
  const token = createOpaqueRecoveryToken();
  await getMarkerStore().issue({
    userId,
    tokenHash: hashRecoveryMarkerToken(token),
    expiresAtMs: nowMs + RECOVERY_MARKER_TTL_SECONDS * 1000,
  });
  adapter.set(RECOVERY_COOKIE_NAME, token, recoveryCookieOptions());
}

export async function peekRecoveryMarkerForUser(userId: string): Promise<boolean> {
  const adapter = await getCookieAdapter();
  const token = adapter.get(RECOVERY_COOKIE_NAME);
  if (!token) {
    return false;
  }

  return getMarkerStore().peek({
    userId,
    tokenHash: hashRecoveryMarkerToken(token),
  });
}

export async function consumeRecoveryMarkerForUser(userId: string): Promise<boolean> {
  const adapter = await getCookieAdapter();
  const token = adapter.get(RECOVERY_COOKIE_NAME);
  if (!token) {
    return false;
  }

  return getMarkerStore().consume({
    userId,
    tokenHash: hashRecoveryMarkerToken(token),
  });
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
