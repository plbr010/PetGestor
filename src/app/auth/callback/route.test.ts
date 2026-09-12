import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getClaims = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      getClaims,
    },
  })),
}));

import {
  RECOVERY_COOKIE_NAME,
  createMemoryRecoveryCookieAdapter,
  createRecoveryTicket,
  resolveRecoverySecret,
  setRecoveryCookieAdapterForTests,
  verifyRecoveryMarker,
} from "@/lib/auth/recovery-marker";

describe("GET /auth/callback — prova de recovery", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getClaims.mockReset();
    setRecoveryCookieAdapterForTests(createMemoryRecoveryCookieAdapter());
  });

  afterEach(() => {
    setRecoveryCookieAdapterForTests(null);
  });

  it("recovery legítimo após exchange cria marcador e vai para /nova-senha", async () => {
    const ticket = createRecoveryTicket(resolveRecoverySecret());
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const { GET } = await import("./route");
    const url = `https://app.petgestor.test/auth/callback?code=pkce&flow=recovery&rt=${encodeURIComponent(ticket)}`;

    await expect(GET(new Request(url))).rejects.toThrow("REDIRECT:/nova-senha");

    const { peekRecoveryMarkerForUser } = await import("@/lib/auth/recovery-marker");
    expect(await peekRecoveryMarkerForUser("user-1")).toBe(true);
  });

  it("callback com next=/nova-senha sem ticket de recovery NÃO cria marcador", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const { GET } = await import("./route");
    const url = "https://app.petgestor.test/auth/callback?code=pkce&next=/nova-senha";

    await expect(GET(new Request(url))).rejects.toThrow("REDIRECT:/nova-senha");

    const { peekRecoveryMarkerForUser } = await import("@/lib/auth/recovery-marker");
    expect(await peekRecoveryMarkerForUser("user-1")).toBe(false);
  });

  it("ticket adulterado não cria marcador", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const { GET } = await import("./route");
    const url =
      "https://app.petgestor.test/auth/callback?code=pkce&flow=recovery&rt=adulterado.token";

    await expect(GET(new Request(url))).rejects.toThrow("REDIRECT:/dashboard");

    const { peekRecoveryMarkerForUser } = await import("@/lib/auth/recovery-marker");
    expect(await peekRecoveryMarkerForUser("user-1")).toBe(false);
  });

  it("marcador emitido está assinado para o sub da sessão trocada", async () => {
    const adapter = createMemoryRecoveryCookieAdapter();
    setRecoveryCookieAdapterForTests(adapter);
    const ticket = createRecoveryTicket(resolveRecoverySecret());
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const { GET } = await import("./route");
    const url = `https://app.petgestor.test/auth/callback?code=pkce&flow=recovery&rt=${encodeURIComponent(ticket)}`;
    await expect(GET(new Request(url))).rejects.toThrow("REDIRECT:/nova-senha");

    const token = adapter.get(RECOVERY_COOKIE_NAME);
    expect(token).toBeTruthy();
    expect(verifyRecoveryMarker(token!, "user-1", resolveRecoverySecret())).not.toBeNull();
    expect(verifyRecoveryMarker(token!, "other", resolveRecoverySecret())).toBeNull();
  });
});
