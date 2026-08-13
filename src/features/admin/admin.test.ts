import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { AdminCompanyListItem } from "@/features/admin/types";
import {
  adminStatusLabel,
  buildAdminSummary,
  formatAdminTrialRemaining,
  mapEntitlementToAdminStatus,
} from "@/features/admin/utils";

function makeItem(
  overrides: Partial<AdminCompanyListItem> & Pick<AdminCompanyListItem, "accountStatus">,
): AdminCompanyListItem {
  return {
    companyId: "11111111-1111-1111-1111-111111111111",
    companyName: "Pet Shop",
    ownerName: "Ana",
    ownerEmail: "ana@example.com",
    createdAt: "2026-08-01T00:00:00.000Z",
    entitlementState: "trialing",
    hasOperationalAccess: true,
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    trialEndsAt: "2026-08-04T00:00:00.000Z",
    trialRemainingLabel: "1d 0h restantes",
    subscribedAt: null,
    nextPaymentAt: null,
    lastPaymentAt: null,
    lastPaymentStatus: null,
    monthlyPriceCents: 8990,
    providerSubscriptionId: null,
    providerStatus: null,
    subscription: null,
    ...overrides,
  };
}

describe("admin status mapping", () => {
  it("mapeia entitlement para status visual do painel", () => {
    expect(mapEntitlementToAdminStatus("trialing")).toBe("trial");
    expect(mapEntitlementToAdminStatus("active")).toBe("active");
    expect(mapEntitlementToAdminStatus("past_due")).toBe("past_due");
    expect(mapEntitlementToAdminStatus("cancelled")).toBe("cancelled");
    expect(mapEntitlementToAdminStatus("trial_expired")).toBe("blocked");
  });

  it("rotula status de forma estável", () => {
    expect(adminStatusLabel("trial")).toBe("TRIAL");
    expect(adminStatusLabel("active")).toBe("ATIVO");
    expect(adminStatusLabel("past_due")).toBe("INADIMPLENTE");
    expect(adminStatusLabel("cancelled")).toBe("CANCELADO");
    expect(adminStatusLabel("blocked")).toBe("EXPIRADO/BLOQUEADO");
  });
});

describe("formatAdminTrialRemaining", () => {
  it("mostra tempo restante do trial de 72h", () => {
    const now = new Date("2026-08-01T10:00:00.000Z");
    const ends = "2026-08-03T00:00:00.000Z";
    expect(formatAdminTrialRemaining(ends, now)).toBe("1d 14h restantes");
  });

  it("mostra expiração relativa sem nova regra de trial", () => {
    const now = new Date("2026-08-04T05:00:00.000Z");
    const ends = "2026-08-04T00:00:00.000Z";
    expect(formatAdminTrialRemaining(ends, now)).toBe("Expirado há 5h");
  });
});

describe("buildAdminSummary", () => {
  it("agrega cards e MRR apenas de contas ativas", () => {
    const summary = buildAdminSummary([
      makeItem({ accountStatus: "trial", companyId: "a" }),
      makeItem({ accountStatus: "active", companyId: "b" }),
      makeItem({ accountStatus: "active", companyId: "c" }),
      makeItem({ accountStatus: "past_due", companyId: "d" }),
      makeItem({ accountStatus: "cancelled", companyId: "e" }),
      makeItem({ accountStatus: "blocked", companyId: "f" }),
    ]);

    expect(summary).toEqual({
      totalAccounts: 6,
      trialCount: 1,
      activeCount: 2,
      pastDueCount: 1,
      cancelledCount: 1,
      blockedCount: 1,
      estimatedMrrCents: 17_980,
    });
  });
});

describe("requirePlatformAdmin authorization", () => {
  const requireUserMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const notFoundMock = vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  });

  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    maybeSingleMock.mockReset();
    notFoundMock.mockClear();

    vi.doMock("server-only", () => ({}));

    vi.doMock("@/lib/auth/require-user", () => ({
      requireUser: requireUserMock,
    }));

    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: maybeSingleMock,
            })),
          })),
        })),
      })),
    }));

    vi.doMock("next/navigation", () => ({
      notFound: notFoundMock,
    }));
  });

  afterEach(() => {
    vi.doUnmock("server-only");
    vi.doUnmock("@/lib/auth/require-user");
    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("next/navigation");
  });

  it("permite platform admin autenticado via tabela", async () => {
    requireUserMock.mockResolvedValue({ id: "user-admin", email: "owner@petgestor.app" });
    maybeSingleMock.mockResolvedValue({
      data: { user_id: "user-admin" },
      error: null,
    });

    const { requirePlatformAdmin } = await import("@/lib/auth/require-platform-admin");
    await expect(requirePlatformAdmin()).resolves.toEqual({
      id: "user-admin",
      email: "owner@petgestor.app",
    });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("permite conta allowlisted plbrpc mesmo sem linha em platform_admins", async () => {
    requireUserMock.mockResolvedValue({ id: "user-owner", email: "plbrpc@gmail.com" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const { requirePlatformAdmin, isPlatformAdmin } = await import(
      "@/lib/auth/require-platform-admin"
    );
    await expect(
      isPlatformAdmin({ id: "user-owner", email: "plbrpc@gmail.com" }),
    ).resolves.toBe(true);
    await expect(requirePlatformAdmin()).resolves.toEqual({
      id: "user-owner",
      email: "plbrpc@gmail.com",
    });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("retorna 404 para cliente comum", async () => {
    requireUserMock.mockResolvedValue({ id: "user-client", email: "cliente@example.com" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const { requirePlatformAdmin } = await import("@/lib/auth/require-platform-admin");
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("isPlatformAdmin é falso para usuário sem registro e fora da allowlist", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { isPlatformAdmin } = await import("@/lib/auth/require-platform-admin");
    await expect(
      isPlatformAdmin({ id: "user-client", email: "cliente@example.com" }),
    ).resolves.toBe(false);
  });
});

describe("admin security boundaries", () => {
  it("queries administrativas são server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/features/admin/queries.ts"), "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("createSupabaseAdminClient");
  });

  it("gate administrativo é server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/lib/auth/require-platform-admin.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("notFound");
  });

  it("migration de platform_admins impede auto-promoção via RLS", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260813190000_platform_admins.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.platform_admins");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("platform_admins_select_own");
    expect(migration).not.toMatch(/FOR INSERT TO authenticated/i);
    expect(migration).not.toMatch(/FOR UPDATE TO authenticated/i);
    expect(migration).not.toMatch(/FOR DELETE TO authenticated/i);
  });
});
