import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapProfile } from "@/features/companies/queries";

describe("mapProfile", () => {
  it("mapeia profile completo com tutorial", () => {
    expect(
      mapProfile({
        full_name: "Ana",
        avatar_url: null,
        onboarding_tutorial_completed_at: "2026-08-14T00:00:00.000Z",
      }),
    ).toEqual({
      fullName: "Ana",
      avatarUrl: null,
      onboardingTutorialCompletedAt: "2026-08-14T00:00:00.000Z",
    });
  });

  it("trata tutorial NULL como ainda pendente", () => {
    expect(
      mapProfile({
        full_name: "Ana",
        avatar_url: null,
        onboarding_tutorial_completed_at: null,
      })?.onboardingTutorialCompletedAt,
    ).toBeNull();
  });

  it("quando a coluna do tutorial não existe, não quebra e evita reabrir o tour", () => {
    const profile = mapProfile({
      full_name: "Ana",
      avatar_url: null,
    });

    expect(profile?.fullName).toBe("Ana");
    expect(profile?.onboardingTutorialCompletedAt).toBeTruthy();
  });
});

describe("loadProfileForUser fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("faz fallback para select sem a coluna quando a migration ainda não existe", async () => {
    const maybeSingleTutorial = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column does not exist" },
    });
    const maybeSingleFallback = vi.fn().mockResolvedValue({
      data: { full_name: "Ana", avatar_url: null },
      error: null,
    });

    const eqTutorial = vi.fn(() => ({ maybeSingle: maybeSingleTutorial }));
    const eqFallback = vi.fn(() => ({ maybeSingle: maybeSingleFallback }));
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ eq: eqTutorial }))
      .mockImplementationOnce(() => ({ eq: eqFallback }));

    const supabase = {
      from: vi.fn(() => ({ select })),
    };

    const { loadProfileForUser } = await import("@/features/companies/queries");
    const profile = await loadProfileForUser(supabase as never, "user-1");

    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[0]?.[0]).toContain("onboarding_tutorial_completed_at");
    expect(select.mock.calls[1]?.[0]).toBe("full_name, avatar_url");
    expect(profile).toEqual({
      fullName: "Ana",
      avatarUrl: null,
      onboardingTutorialCompletedAt: "1970-01-01T00:00:00.000Z",
    });
  });
});

const COMPANY_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Pet Shop A",
  timezone: "America/Sao_Paulo",
};

const ACTIVE_MEMBER = {
  role: "staff" as const,
  company_id: COMPANY_ROW.id,
  access_profile: "reception",
  permissions: ["dashboard.view"],
  access_revoked_at: null,
  employee_id: "emp-1",
  own_schedule_only: false,
};

const REVOKED_MEMBER = {
  ...ACTIVE_MEMBER,
  access_revoked_at: "2026-09-01T12:00:00.000Z",
};

function membershipClient(options: {
  active?: { data: unknown; error: { code: string; message: string } | null };
  revoked?: { data: unknown; error: { code: string; message: string } | null };
  company?: { data: unknown; error: { code: string; message: string } | null };
}) {
  return {
    from(table: string) {
      if (table === "companies") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                options.company ?? { data: COMPANY_ROW, error: null },
            }),
          }),
        };
      }

      return {
        select: () => {
          let mode: "active" | "revoked" = "active";
          const builder = {
            eq: () => builder,
            is: () => {
              mode = "active";
              return builder;
            },
            not: () => {
              mode = "revoked";
              return builder;
            },
            order: () => builder,
            limit: () => builder,
            maybeSingle: async () => {
              if (mode === "revoked") {
                return options.revoked ?? { data: null, error: null };
              }
              return options.active ?? { data: null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };
}

describe("loadMembershipForUser fail-closed", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("1) membership ativa retorna contexto operacional", async () => {
    const { loadMembershipForUser } = await import("@/features/companies/queries");
    const result = await loadMembershipForUser(
      membershipClient({ active: { data: ACTIVE_MEMBER, error: null } }) as never,
      "user-1",
    );

    expect(result.status).toBe("active");
    if (result.status !== "active") {
      throw new Error("expected active");
    }
    expect(result.membership.accessRevokedAt).toBeNull();
    expect(result.membership.company.id).toBe(COMPANY_ROW.id);
  });

  it("2) membership revogada nunca vira ativa nem inventa access_revoked_at = null", async () => {
    const { loadMembershipForUser } = await import("@/features/companies/queries");
    const result = await loadMembershipForUser(
      membershipClient({
        active: { data: null, error: null },
        revoked: { data: REVOKED_MEMBER, error: null },
      }) as never,
      "user-1",
    );

    expect(result.status).toBe("revoked");
    if (result.status !== "revoked") {
      throw new Error("expected revoked");
    }
    expect(result.membership.accessRevokedAt).toBe(REVOKED_MEMBER.access_revoked_at);
    expect(result.membership.accessRevokedAt).not.toBeNull();
  });

  it("3) usuário sem membership retorna ausência de contexto", async () => {
    const { loadMembershipForUser } = await import("@/features/companies/queries");
    const result = await loadMembershipForUser(
      membershipClient({
        active: { data: null, error: null },
        revoked: { data: null, error: null },
      }) as never,
      "user-1",
    );

    expect(result.status).toBe("none");
  });

  it("4) erro de consulta não vira permissão", async () => {
    const { loadMembershipForUser } = await import("@/features/companies/queries");
    const result = await loadMembershipForUser(
      membershipClient({
        active: {
          data: null,
          error: { code: "PGRST301", message: "JWT expired" },
        },
      }) as never,
      "user-1",
    );

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected error");
    }
    expect(result.code).toBe("PGRST301");
  });

  it("consulta marcada como ativa que devolve linha revogada falha fechada", async () => {
    const { loadMembershipForUser } = await import("@/features/companies/queries");
    const result = await loadMembershipForUser(
      membershipClient({
        active: { data: REVOKED_MEMBER, error: null },
      }) as never,
      "user-1",
    );

    expect(result.status).toBe("error");
  });

  it("getUserContext propaga membership revogada e não a promove", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () =>
        membershipClient({
          active: { data: null, error: null },
          revoked: { data: REVOKED_MEMBER, error: null },
        }),
      ),
    }));

    const { getUserContext } = await import("@/features/companies/queries");
    const context = await getUserContext("user-1");
    expect(context.membership?.accessRevokedAt).toBe(REVOKED_MEMBER.access_revoked_at);
  });

  it("erro técnico em getUserContext lança em vez de conceder acesso", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () =>
        membershipClient({
          active: {
            data: null,
            error: { code: "57014", message: "statement timeout" },
          },
        }),
      ),
    }));

    const { getUserContext } = await import("@/features/companies/queries");
    await expect(getUserContext("user-1")).rejects.toThrow(
      /Não foi possível carregar o acesso à empresa/,
    );
  });

  it("código não contém fallback que inventa access_revoked_at = null", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/companies/queries.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/access_revoked_at:\s*null/);
    expect(source).toContain("fail-closed");
    expect(source).toContain('.is("access_revoked_at", null)');
  });
});
