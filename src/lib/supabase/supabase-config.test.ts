import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClientMock = vi.fn(() => ({ auth: {} }));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => createBrowserClientMock(),
  createServerClient: vi.fn(),
}));

describe("supabase client configuration", () => {
  beforeEach(() => {
    createBrowserClientMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_example_key",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("inicializa o browser client com variáveis públicas", async () => {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");

    createSupabaseBrowserClient();

    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
  });

  it("falha ao criar browser client quando variáveis estão ausentes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.resetModules();

    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");

    expect(() => createSupabaseBrowserClient()).toThrow(/NEXT_PUBLIC_SUPABASE/i);
  });
});
