import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getProfilePermissions,
  hasPermission,
  type MembershipAccess,
} from "@/lib/auth/permissions";
import { getRequiredPermissionForPath } from "@/lib/auth/route-permissions";
import { assertPermissionForAction } from "@/lib/auth/require-permission";
import { isPathInCompany } from "@/features/attachments/paths";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260911120000_authorization_rls_tenant_isolation.sql",
);

function membership(
  overrides: Partial<MembershipAccess> & Pick<MembershipAccess, "role">,
): MembershipAccess {
  return {
    accessProfile: overrides.accessProfile ?? null,
    permissions: overrides.permissions ?? [],
    accessRevokedAt: overrides.accessRevokedAt ?? null,
    employeeId: overrides.employeeId ?? null,
    ownScheduleOnly: overrides.ownScheduleOnly ?? false,
    role: overrides.role,
  };
}

function ctx(m: MembershipAccess, companyId = COMPANY_A) {
  return {
    user: { id: "u1", email: "test@test.com" },
    profile: { fullName: "Test", avatarUrl: null, onboardingTutorialCompletedAt: null },
    membership: { ...m, company: { id: companyId, name: "TestCo", timezone: "America/Sao_Paulo" } },
  };
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("BLOCO 1 — membership revogada no SQL", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("is_company_member e has_company_role exigem access_revoked_at IS NULL", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION private\.is_company_member[\s\S]*access_revoked_at IS NULL/,
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION private\.has_company_role[\s\S]*access_revoked_at IS NULL/,
    );
    expect(sql).toContain("private.member_has_active_access");
  });

  it("get_auth_company_id não infere tenant por ORDER BY created_at LIMIT 1", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION private.get_auth_company_id()"),
      sql.indexOf("CREATE OR REPLACE FUNCTION private.try_storage_company_id"),
    );
    expect(fn).toContain("petgestor.company_id");
    expect(fn).not.toMatch(/ORDER BY[\s\S]*created_at[\s\S]*LIMIT 1/);
  });

  it("RPCs públicas de mutação exigem p_company_id e membership ativa", () => {
    expect(sql).toContain("PERFORM private.activate_company_context(p_company_id)");
    expect(sql).toContain("PERFORM private.require_app_permission(p_company_id, 'appointments.create')");
    expect(sql).toContain("PERFORM private.require_app_permission(p_company_id, 'finance.create')");
    expect(sql).toContain("p_company_id uuid DEFAULT NULL");
  });

  it("RLS de mutação usa permissão granular nas tabelas sensíveis", () => {
    expect(sql).toContain("private.has_app_permission(company_id, 'customers.create')");
    expect(sql).toContain("private.has_app_permission(company_id, 'pets.edit')");
    expect(sql).toContain("private.has_app_permission(company_id, 'services.manage')");
    expect(sql).toContain("private.has_app_permission(company_id, 'appointments.create')");
    expect(sql).toContain("private.has_app_permission(company_id, 'finance.view')");
    expect(sql).toContain("private.has_app_permission(company_id, 'inventory.manage')");
    expect(sql).toContain("private.has_app_permission(company_id, 'pos.use')");
  });

  it("Storage exige membership ativa, pasta da empresa e permissão por tipo de path", () => {
    expect(sql).toContain("bucket_id = 'company-files'");
    expect(sql).toContain("private.try_storage_company_id(name)");
    expect(sql).toContain("private.has_app_permission(private.try_storage_company_id(name), 'pets.edit')");
    expect(sql).toContain("'service_orders.update_status'");
  });

  it("REVOKE de INSERT direto em tabelas mutadas só via RPC", () => {
    expect(sql).toContain("REVOKE INSERT ON public.appointments FROM authenticated");
    expect(sql).toContain("REVOKE INSERT ON public.service_orders FROM authenticated");
    expect(sql).toContain("REVOKE INSERT ON public.sales FROM authenticated");
    expect(sql).toContain("REVOKE INSERT ON public.cash_sessions FROM authenticated");
  });
});

describe("BLOCO 1 — matriz de autorização da aplicação", () => {
  it("OWNER acessa módulos e mutações esperadas", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(hasPermission(owner, "finance.view")).toBe(true);
    expect(hasPermission(owner, "appointments.create")).toBe(true);
    expect(hasPermission(owner, "settings.manage")).toBe(true);
    expect(assertPermissionForAction(ctx(owner), "customers.create")).toBeNull();
  });

  it("ADMIN segue o catálogo existente (acesso total)", () => {
    const admin = membership({ role: "admin", accessProfile: "owner_admin" });
    expect(hasPermission(admin, "employees.manage")).toBe(true);
    expect(assertPermissionForAction(ctx(admin), "inventory.adjust")).toBeNull();
  });

  it("STAFF COM permissão opera; STAFF SEM permissão é negado na action", () => {
    const withPerm = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    const withoutFinanceView = withPerm;
    expect(hasPermission(withPerm, "customers.create")).toBe(true);
    expect(assertPermissionForAction(ctx(withPerm), "customers.create")).toBeNull();
    expect(hasPermission(withoutFinanceView, "finance.view")).toBe(false);
    expect(assertPermissionForAction(ctx(withoutFinanceView), "finance.view")?.error).toMatch(
      /permissão/i,
    );
  });

  it("STAFF REVOGADO perde rota, query, mutation, RPC e storage na camada de permissão", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(hasPermission(revoked, "dashboard.view")).toBe(false);
    expect(assertPermissionForAction(ctx(revoked), "customers.view")?.error).toMatch(/removido/i);
  });

  it("token antigo de staff revogado continua sem permissão efetiva", () => {
    const stale = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      accessRevokedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(hasPermission(stale, "appointments.create")).toBe(false);
    expect(assertPermissionForAction(ctx(stale), "appointments.create")?.error).toMatch(/removido/i);
  });

  it("usuário em duas empresas: permissões são por membership, não globais", () => {
    const companyA = membership({
      role: "owner",
      accessProfile: "owner_admin",
    });
    const companyB = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    expect(hasPermission(companyA, "finance.view")).toBe(true);
    expect(hasPermission(companyB, "finance.view")).toBe(false);
    expect(ctx(companyA, COMPANY_A).membership.company.id).not.toBe(COMPANY_B);
  });
});

describe("BLOCO 1 — URL direta", () => {
  it("staff sem finance.view precisa de finance.view em /dashboard/financeiro", () => {
    expect(getRequiredPermissionForPath("/dashboard/financeiro")).toBe("finance.view");
    expect(getRequiredPermissionForPath("/dashboard/financeiro/abc")).toBe("finance.view");
    expect(getRequiredPermissionForPath("/dashboard/servicos")).toBe("services.view");
    expect(getRequiredPermissionForPath("/dashboard/agenda")).toBe("appointments.view");
    expect(getRequiredPermissionForPath("/dashboard/pdv")).toBe("pos.use");
    expect(getRequiredPermissionForPath("/dashboard/estoque")).toBe("inventory.view");
  });
});

describe("BLOCO 1 — assertCurrentRoutePermission fail-closed", () => {
  const headersGet = vi.fn();
  const requireUserMock = vi.fn();
  const requireCompanyMock = vi.fn();
  const isPlatformAdminMock = vi.fn();
  const redirectMock = vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });

  beforeEach(() => {
    vi.resetModules();
    headersGet.mockReset();
    requireUserMock.mockReset();
    requireCompanyMock.mockReset();
    isPlatformAdminMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });

    vi.doMock("next/headers", () => ({
      headers: async () => ({ get: headersGet }),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: (path: string) => redirectMock(path),
    }));
    vi.doMock("@/lib/auth/require-user", () => ({
      requireUser: (...args: unknown[]) => requireUserMock(...args),
    }));
    vi.doMock("@/lib/auth/require-platform-admin", () => ({
      isPlatformAdmin: (...args: unknown[]) => isPlatformAdminMock(...args),
    }));
    vi.doMock("@/features/companies/queries", () => ({
      requireCompany: (...args: unknown[]) => requireCompanyMock(...args),
    }));
  });

  afterEach(() => {
    vi.doUnmock("next/headers");
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/lib/auth/require-user");
    vi.doUnmock("@/lib/auth/require-platform-admin");
    vi.doUnmock("@/features/companies/queries");
  });

  it("pathname ausente não libera a rota — exige dashboard.view", async () => {
    headersGet.mockReturnValue(null);
    requireUserMock.mockResolvedValue({ id: "u1" });
    isPlatformAdminMock.mockResolvedValue(false);
    requireCompanyMock.mockResolvedValue(
      ctx(
        membership({
          role: "staff",
          accessProfile: "operational",
          permissions: ["pets.view"],
        }),
      ),
    );

    const { assertCurrentRoutePermission } = await import(
      "@/lib/auth/assert-route-permission"
    );
    await expect(assertCurrentRoutePermission()).rejects.toThrow(
      "REDIRECT:/dashboard/sem-permissao",
    );
  });

  it("URL direta /dashboard/financeiro sem finance.view redireciona para sem permissão", async () => {
    headersGet.mockReturnValue("/dashboard/financeiro");
    requireUserMock.mockResolvedValue({ id: "u1" });
    isPlatformAdminMock.mockResolvedValue(false);
    requireCompanyMock.mockResolvedValue(
      ctx(
        membership({
          role: "staff",
          accessProfile: "operational",
          permissions: getProfilePermissions("operational"),
        }),
      ),
    );

    const { assertCurrentRoutePermission } = await import(
      "@/lib/auth/assert-route-permission"
    );
    await expect(assertCurrentRoutePermission()).rejects.toThrow(
      "REDIRECT:/dashboard/sem-permissao",
    );
  });

  it("staff revogado em URL direta vai para acesso-revogado", async () => {
    headersGet.mockReturnValue("/dashboard/agenda");
    requireUserMock.mockResolvedValue({ id: "u1" });
    isPlatformAdminMock.mockResolvedValue(false);
    requireCompanyMock.mockResolvedValue(
      ctx(
        membership({
          role: "staff",
          accessProfile: "reception",
          permissions: getProfilePermissions("reception"),
          accessRevokedAt: "2026-09-11T00:00:00.000Z",
        }),
      ),
    );

    const { assertCurrentRoutePermission } = await import(
      "@/lib/auth/assert-route-permission"
    );
    await expect(assertCurrentRoutePermission()).rejects.toThrow(
      "REDIRECT:/dashboard/acesso-revogado",
    );
  });
});

describe("BLOCO 1 — Server Actions exigem permissão mínima", () => {
  it("mutações de tutores/pets/serviços/agenda/OS/pacotes não usam só requireCompanyContext", () => {
    const files = [
      "src/features/customers/actions.ts",
      "src/features/pets/actions.ts",
      "src/features/services/actions.ts",
      "src/features/appointments/actions.ts",
      "src/features/service-orders/actions.ts",
      "src/features/service-packages/actions.ts",
      "src/features/attachments/actions.ts",
      "src/features/finance/actions.ts",
      "src/features/inventory/actions.ts",
      "src/features/pos/actions.ts",
      "src/features/employees/actions.ts",
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain("requirePermission(");
      expect(source).not.toMatch(/await requireCompanyContext\(\)/);
    }
  });

  it("RPCs de mutação enviam p_company_id do contexto ativo", () => {
    expect(read("src/features/appointments/actions.ts")).toContain(
      "p_company_id: context.membership.company.id",
    );
    expect(read("src/features/pos/actions.ts")).toContain(
      "p_company_id: context.membership.company.id",
    );
    expect(read("src/features/pos/actions.ts")).not.toMatch(
      /trackStock: true,\s*p_company_id:/,
    );
  });
});

describe("BLOCO 1 — Storage path não troca de empresa", () => {
  it("path de outra empresa é rejeitado", () => {
    expect(isPathInCompany(COMPANY_A, `${COMPANY_A}/pets/x/photo/main.jpg`)).toBe(true);
    expect(isPathInCompany(COMPANY_A, `${COMPANY_B}/pets/x/photo/main.jpg`)).toBe(false);
    expect(isPathInCompany(COMPANY_A, `../${COMPANY_B}/pets/x`)).toBe(false);
  });
});
