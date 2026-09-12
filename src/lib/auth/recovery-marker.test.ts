import { afterEach, describe, expect, it } from "vitest";

import {
  RECOVERY_COOKIE_NAME,
  RECOVERY_COOKIE_PATH,
  RECOVERY_MARKER_TTL_SECONDS,
  RECOVERY_TICKET_TTL_SECONDS,
  clearRecoveryMarkerCookie,
  createMemoryRecoveryCookieAdapter,
  createRecoveryMarker,
  createRecoveryTicket,
  issueRecoveryMarkerCookie,
  peekRecoveryMarkerForUser,
  recoveryCookieOptions,
  resolveRecoverySecret,
  setRecoveryCookieAdapterForTests,
  signRecoveryPayload,
  verifyRecoveryMarker,
  verifyRecoveryTicket,
} from "@/lib/auth/recovery-marker";

const SECRET = "test-recovery-secret";

describe("recovery ticket e marcador", () => {
  afterEach(() => {
    setRecoveryCookieAdapterForTests(null);
  });

  it("ticket válido verifica; expirado e adulterado falham", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const ticket = createRecoveryTicket(SECRET, now);
    expect(verifyRecoveryTicket(ticket, SECRET, now)).not.toBeNull();
    expect(verifyRecoveryTicket(ticket, SECRET, now + RECOVERY_TICKET_TTL_SECONDS * 1000 + 1)).toBeNull();

    const tampered = `${ticket.slice(0, -2)}aa`;
    expect(verifyRecoveryTicket(tampered, SECRET, now)).toBeNull();
    expect(verifyRecoveryTicket("not-a-ticket", SECRET, now)).toBeNull();
  });

  it("marcador fica vinculado ao usuário e rejeita outro sub", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const marker = createRecoveryMarker("user-a", SECRET, now);
    expect(verifyRecoveryMarker(marker, "user-a", SECRET, now)).not.toBeNull();
    expect(verifyRecoveryMarker(marker, "user-b", SECRET, now)).toBeNull();
  });

  it("marcador expirado ou adulterado é recusado", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const marker = createRecoveryMarker("user-a", SECRET, now);
    expect(
      verifyRecoveryMarker(marker, "user-a", SECRET, now + RECOVERY_MARKER_TTL_SECONDS * 1000 + 1),
    ).toBeNull();

    const [encoded] = marker.split(".");
    const badSig = signRecoveryPayload(
      { typ: "recovery_marker", sub: "user-a", jti: "x", exp: 9_999_999_999 },
      "other-secret",
    );
    expect(verifyRecoveryMarker(badSig, "user-a", SECRET, now)).toBeNull();
    expect(verifyRecoveryMarker(`${encoded}.AAAA`, "user-a", SECRET, now)).toBeNull();
  });

  it("cookie é HttpOnly, path restrito e TTL curto", () => {
    const options = recoveryCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe(RECOVERY_COOKIE_PATH);
    expect(options.path).toBe("/nova-senha");
    expect(options.maxAge).toBe(RECOVERY_MARKER_TTL_SECONDS);
    expect(RECOVERY_MARKER_TTL_SECONDS).toBe(15 * 60);
    expect(RECOVERY_COOKIE_NAME).toBe("pg_pwd_recovery");
  });

  it("issue + peek + clear no adapter em memória", async () => {
    const adapter = createMemoryRecoveryCookieAdapter();
    setRecoveryCookieAdapterForTests(adapter);

    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
    await issueRecoveryMarkerCookie("u1");
    expect(await peekRecoveryMarkerForUser("u1")).toBe(true);
    expect(await peekRecoveryMarkerForUser("u2")).toBe(false);

    await clearRecoveryMarkerCookie();
    expect(await peekRecoveryMarkerForUser("u1")).toBe(false);
  });

  it("marcador de outro usuário no cookie é recusado", async () => {
    const adapter = createMemoryRecoveryCookieAdapter();
    setRecoveryCookieAdapterForTests(adapter);
    adapter.set(
      RECOVERY_COOKIE_NAME,
      createRecoveryMarker("owner", resolveRecoverySecret()),
      recoveryCookieOptions(),
    );
    expect(await peekRecoveryMarkerForUser("intruder")).toBe(false);
    expect(await peekRecoveryMarkerForUser("owner")).toBe(true);
  });

  it("resolveRecoverySecret prefere AUTH_RECOVERY_SECRET", () => {
    expect(resolveRecoverySecret({ AUTH_RECOVERY_SECRET: " explicit " })).toBe("explicit");
    expect(
      resolveRecoverySecret({
        SUPABASE_SERVICE_ROLE_KEY: "srk",
      }),
    ).toBe("petgestor-recovery-v1:srk");
  });
});
