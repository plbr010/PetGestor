import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const createSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

vi.mock("@/lib/env/public-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env/public-env")>();

  return {
    ...actual,
    hasPublicEnv: vi.fn(),
  };
});

import { hasPublicEnv } from "@/lib/env/public-env";
import { checkSupabaseConnection } from "@/lib/supabase/connection-check";

describe("supabase connection check", () => {
  beforeEach(() => {
    vi.mocked(hasPublicEnv).mockReset();
    getSession.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("informa configuração ausente sem expor segredos", async () => {
    vi.mocked(hasPublicEnv).mockReturnValue(false);

    const result = await checkSupabaseConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Variáveis do Supabase ausentes");
    expect(result.message).not.toMatch(/sb_publishable_|supabase\.co/i);
  });

  it("valida conexão quando auth.getSession responde sem erro", async () => {
    vi.mocked(hasPublicEnv).mockReturnValue(true);
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getSession },
    });

    const result = await checkSupabaseConnection();

    expect(result.ok).toBe(true);
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("retorna erro genérico quando auth.getSession falha", async () => {
    vi.mocked(hasPublicEnv).mockReturnValue(true);
    getSession.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid key" },
    });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getSession },
    });

    const result = await checkSupabaseConnection();

    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("invalid key");
  });
});
