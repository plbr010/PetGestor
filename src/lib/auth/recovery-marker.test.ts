import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RECOVERY_COOKIE_NAME,
  RECOVERY_COOKIE_PATH,
  RECOVERY_MARKER_TTL_SECONDS,
  RECOVERY_SECRET_MIN_BYTES,
  RECOVERY_TICKET_TTL_SECONDS,
  RecoverySecretConfigError,
  clearRecoveryMarkerCookie,
  consumeRecoveryMarkerForUser,
  createMemoryRecoveryCookieAdapter,
  createMemoryRecoveryMarkerStore,
  createOpaqueRecoveryToken,
  createRecoveryTicket,
  hashRecoveryMarkerToken,
  issueRecoveryMarkerCookie,
  peekRecoveryMarkerForUser,
  recoveryCookieOptions,
  resolveRecoverySecret,
  setRecoveryCookieAdapterForTests,
  setRecoveryMarkerStoreForTests,
  verifyRecoveryTicket,
} from "@/lib/auth/recovery-marker";

const VALID_SECRET = "petgestor-test-recovery-secret-32b!";

describe("AUTH_RECOVERY_SECRET", () => {
  it("aceita somente AUTH_RECOVERY_SECRET com ≥ 32 bytes", () => {
    expect(resolveRecoverySecret({ AUTH_RECOVERY_SECRET: VALID_SECRET })).toBe(VALID_SECRET);
    expect(Buffer.byteLength(VALID_SECRET, "utf8")).toBeGreaterThanOrEqual(RECOVERY_SECRET_MIN_BYTES);
  });

  it("production sem AUTH_RECOVERY_SECRET falha fechado", () => {
    expect(() =>
      resolveRecoverySecret({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toThrow(RecoverySecretConfigError);
  });

  it("production com só NEXT_PUBLIC_SUPABASE_URL NÃO aceita como segredo", () => {
    expect(() =>
      resolveRecoverySecret({
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://public.supabase.co",
      }),
    ).toThrow(RecoverySecretConfigError);
  });

  it("production com service role mas sem AUTH_RECOVERY_SECRET NÃO usa service role", () => {
    expect(() =>
      resolveRecoverySecret({
        NODE_ENV: "production",
        SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key-value",
      }),
    ).toThrow(RecoverySecretConfigError);
  });

  it("segredo curto é recusado", () => {
    expect(() => resolveRecoverySecret({ AUTH_RECOVERY_SECRET: "short" })).toThrow(
      RecoverySecretConfigError,
    );
  });

  it("código não deriva HMAC de NEXT_PUBLIC_* nem de service role", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/auth/recovery-marker.ts"), "utf8");
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("petgestor-recovery-v1");
    expect(source).not.toContain("petgestor-recovery-dev");
  });

  it("ticket assinado com o segredo válido; segredo errado recusa", () => {
    const ticket = createRecoveryTicket(VALID_SECRET);
    expect(verifyRecoveryTicket(ticket, VALID_SECRET)).not.toBeNull();
    expect(verifyRecoveryTicket(ticket, "other-secret-that-is-32-bytes-long!")).toBeNull();
  });
});

describe("recovery ticket HMAC", () => {
  it("ticket válido verifica; expirado e adulterado falham", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const ticket = createRecoveryTicket(VALID_SECRET, now);
    expect(verifyRecoveryTicket(ticket, VALID_SECRET, now)).not.toBeNull();
    expect(
      verifyRecoveryTicket(ticket, VALID_SECRET, now + RECOVERY_TICKET_TTL_SECONDS * 1000 + 1),
    ).toBeNull();

    const tampered = `${ticket.slice(0, -2)}aa`;
    expect(verifyRecoveryTicket(tampered, VALID_SECRET, now)).toBeNull();
    expect(verifyRecoveryTicket("not-a-ticket", VALID_SECRET, now)).toBeNull();
  });
});

describe("recovery marker one-time", () => {
  let adapter: ReturnType<typeof createMemoryRecoveryCookieAdapter>;
  let store: ReturnType<typeof createMemoryRecoveryMarkerStore>;

  beforeEach(() => {
    adapter = createMemoryRecoveryCookieAdapter();
    store = createMemoryRecoveryMarkerStore();
    setRecoveryCookieAdapterForTests(adapter);
    setRecoveryMarkerStoreForTests(store);
  });

  afterEach(() => {
    setRecoveryCookieAdapterForTests(null);
    setRecoveryMarkerStoreForTests(null);
  });

  it("cookie é HttpOnly, path restrito, TTL curto e valor opaco", async () => {
    const options = recoveryCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe(RECOVERY_COOKIE_PATH);
    expect(options.maxAge).toBe(RECOVERY_MARKER_TTL_SECONDS);

    await issueRecoveryMarkerCookie("u1");
    const token = adapter.get(RECOVERY_COOKIE_NAME);
    expect(token).toBeTruthy();
    expect(token).not.toContain("recovery_marker");
    expect(token).not.toContain("u1");
    expect(hashRecoveryMarkerToken(token!)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("A — issue + peek + consume uma vez", async () => {
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
    await issueRecoveryMarkerCookie("u1");
    expect(await peekRecoveryMarkerForUser("u1")).toBe(true);
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(true);
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("B/C — copiar cookie, primeira troca consome, cópia restaurada recusa", async () => {
    await issueRecoveryMarkerCookie("u1");
    const copy = adapter.get(RECOVERY_COOKIE_NAME);
    expect(copy).toBeTruthy();

    expect(await consumeRecoveryMarkerForUser("u1")).toBe(true);
    adapter.set(RECOVERY_COOKIE_NAME, copy!, recoveryCookieOptions());
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("D — duas requests concorrentes: exatamente uma consome", async () => {
    await issueRecoveryMarkerCookie("u1");
    const token = adapter.get(RECOVERY_COOKIE_NAME)!;
    const hash = hashRecoveryMarkerToken(token);

    const results = await Promise.all([
      store.consume({ userId: "u1", tokenHash: hash }),
      store.consume({ userId: "u1", tokenHash: hash }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("E — consumed_at preenchido nunca reutiliza", async () => {
    await issueRecoveryMarkerCookie("u1");
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(true);
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("F — expirado é recusado", async () => {
    const token = createOpaqueRecoveryToken();
    await store.issue({
      userId: "u1",
      tokenHash: hashRecoveryMarkerToken(token),
      expiresAtMs: Date.now() - 1_000,
    });
    adapter.set(RECOVERY_COOKIE_NAME, token, recoveryCookieOptions());
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("G — token do usuário A com sessão B é recusado", async () => {
    await issueRecoveryMarkerCookie("owner");
    expect(await peekRecoveryMarkerForUser("intruder")).toBe(false);
    expect(await consumeRecoveryMarkerForUser("intruder")).toBe(false);
    expect(await peekRecoveryMarkerForUser("owner")).toBe(true);
  });

  it("H — token adulterado é recusado", async () => {
    await issueRecoveryMarkerCookie("u1");
    adapter.set(RECOVERY_COOKIE_NAME, "adulterado-token", recoveryCookieOptions());
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("limpar cookie não reativa o hash consumido", async () => {
    await issueRecoveryMarkerCookie("u1");
    const copy = adapter.get(RECOVERY_COOKIE_NAME)!;
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(true);
    await clearRecoveryMarkerCookie();
    expect(adapter.get(RECOVERY_COOKIE_NAME)).toBeUndefined();
    adapter.set(RECOVERY_COOKIE_NAME, copy, recoveryCookieOptions());
    expect(await consumeRecoveryMarkerForUser("u1")).toBe(false);
  });
});
