import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireRecoverySession } from "@/lib/auth/guards";
import {
  createMemoryRecoveryCookieAdapter,
  createMemoryRecoveryMarkerStore,
  issueRecoveryMarkerCookie,
  setRecoveryCookieAdapterForTests,
  setRecoveryMarkerStoreForTests,
} from "@/lib/auth/recovery-marker";

describe("requireRecoverySession", () => {
  afterEach(() => {
    setRecoveryCookieAdapterForTests(null);
    setRecoveryMarkerStoreForTests(null);
    vi.mocked(getCurrentUser).mockReset();
  });

  it("2 — usuário logado normalmente é recusado em /nova-senha", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "ana@example.com" });
    setRecoveryCookieAdapterForTests(createMemoryRecoveryCookieAdapter());
    setRecoveryMarkerStoreForTests(createMemoryRecoveryMarkerStore());
    await expect(requireRecoverySession()).rejects.toThrow("REDIRECT:/recuperar-senha");
  });

  it("1 — sessão + marcador válido libera", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "ana@example.com" });
    setRecoveryCookieAdapterForTests(createMemoryRecoveryCookieAdapter());
    setRecoveryMarkerStoreForTests(createMemoryRecoveryMarkerStore());
    await issueRecoveryMarkerCookie("u1");
    await expect(requireRecoverySession()).resolves.toEqual({
      id: "u1",
      email: "ana@example.com",
    });
  });
});
