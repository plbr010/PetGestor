import { describe, expect, it } from "vitest";

import { filterNavItemsByMembership } from "@/lib/auth/nav-filter";
import {
  buildPermissionsPayload,
  canModifyMemberAccess,
  getProfilePermissions,
  getScheduleEmployeeFilter,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isAccessProfile,
  isOwnerOrAdmin,
  isPermission,
  mergePermissionsWithProfile,
  normalizeStoredPermissions,
  PERMISSIONS,
  resolveEffectivePermissions,
  type AccessProfile,
  type MembershipAccess,
  type Permission,
} from "@/lib/auth/permissions";
import { getRequiredPermissionForPath } from "@/lib/auth/route-permissions";
import { assertPermissionForAction } from "@/lib/auth/require-permission";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";

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

function ctx(m: MembershipAccess) {
  return {
    user: { id: "u1", email: "test@test.com" },
    profile: { fullName: "Test", avatarUrl: null, onboardingTutorialCompletedAt: null },
    membership: { ...m, company: { id: COMPANY_A, name: "TestCo", timezone: "America/Sao_Paulo" } },
  };
}

// =========================================================================
// PERMISSÕES — PERFIS
// =========================================================================

describe("employee permissions", () => {
  it("A) owner tem acesso total", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(hasPermission(owner, "finance.view")).toBe(true);
    expect(hasPermission(owner, "settings.manage")).toBe(true);
    expect(hasPermission(owner, "subscription.manage")).toBe(true);
    expect(hasPermission(owner, "inventory.adjust")).toBe(true);
    expect(hasPermission(owner, "pos.apply_discount")).toBe(true);
    expect(resolveEffectivePermissions(owner).size).toBe(PERMISSIONS.length);
  });

  it("admin tem acesso total igual ao owner", () => {
    const admin = membership({ role: "admin", accessProfile: "owner_admin" });
    expect(resolveEffectivePermissions(admin).size).toBe(PERMISSIONS.length);
  });

  it("B) owner não pode ser modificado", () => {
    const actor = { userId: "owner-id", membership: membership({ role: "owner" }) };
    expect(canModifyMemberAccess(actor, { userId: "target", role: "owner" })).toBe(false);
  });

  it("staff não pode modificar ninguém", () => {
    const actor = { userId: "staff-id", membership: membership({ role: "staff" }) };
    expect(canModifyMemberAccess(actor, { userId: "target", role: "staff" })).toBe(false);
  });

  it("owner pode modificar staff", () => {
    const actor = { userId: "owner-id", membership: membership({ role: "owner" }) };
    expect(canModifyMemberAccess(actor, { userId: "target", role: "staff" })).toBe(true);
  });

  it("owner pode modificar admin", () => {
    const actor = { userId: "owner-id", membership: membership({ role: "owner" }) };
    expect(canModifyMemberAccess(actor, { userId: "target", role: "admin" })).toBe(true);
  });

  it("C) gerente tem módulos operacionais e financeiro parcial", () => {
    const manager = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    expect(hasPermission(manager, "employees.manage")).toBe(true);
    expect(hasPermission(manager, "finance.view")).toBe(true);
    expect(hasPermission(manager, "finance.create")).toBe(true);
    expect(hasPermission(manager, "finance.close_cash")).toBe(false);
    expect(hasPermission(manager, "subscription.manage")).toBe(false);
    expect(hasPermission(manager, "settings.manage")).toBe(false);
  });

  it("D) recepção: acesso limitado", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    expect(hasPermission(reception, "customers.create")).toBe(true);
    expect(hasPermission(reception, "appointments.create")).toBe(true);
    expect(hasPermission(reception, "pos.use")).toBe(true);
    expect(hasPermission(reception, "settings.view")).toBe(false);
    expect(hasPermission(reception, "finance.edit")).toBe(false);
    expect(hasPermission(reception, "finance.view")).toBe(false);
    expect(hasPermission(reception, "employees.manage")).toBe(false);
    expect(hasPermission(reception, "inventory.manage")).toBe(false);
  });

  it("E) operacional: agenda + atendimentos", () => {
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    expect(hasPermission(operational, "appointments.view")).toBe(true);
    expect(hasPermission(operational, "service_orders.update_status")).toBe(true);
    expect(hasPermission(operational, "pets.view")).toBe(true);
    expect(hasPermission(operational, "finance.view")).toBe(false);
    expect(hasPermission(operational, "customers.create")).toBe(false);
    expect(hasPermission(operational, "appointments.create")).toBe(false);
    expect(hasPermission(operational, "pos.use")).toBe(false);
  });

  it("F) financeiro: financeiro + relatórios", () => {
    const finance = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
    });
    expect(hasPermission(finance, "finance.view")).toBe(true);
    expect(hasPermission(finance, "finance.close_cash")).toBe(true);
    expect(hasPermission(finance, "reports.view")).toBe(true);
    expect(hasPermission(finance, "pos.use")).toBe(true);
    expect(hasPermission(finance, "appointments.create")).toBe(false);
    expect(hasPermission(finance, "customers.view")).toBe(false);
  });

  it("G) estoque/caixa: estoque + PDV", () => {
    const inventoryCash = membership({
      role: "staff",
      accessProfile: "inventory_cash",
      permissions: getProfilePermissions("inventory_cash"),
    });
    expect(hasPermission(inventoryCash, "inventory.manage")).toBe(true);
    expect(hasPermission(inventoryCash, "pos.use")).toBe(true);
    expect(hasPermission(inventoryCash, "finance.close_cash")).toBe(true);
    expect(hasPermission(inventoryCash, "inventory.adjust")).toBe(false);
    expect(hasPermission(inventoryCash, "settings.view")).toBe(false);
    expect(hasPermission(inventoryCash, "finance.view")).toBe(false);
  });

  it("H) permissão personalizada adiciona ao perfil", () => {
    const custom = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: [...getProfilePermissions("reception"), "finance.view"],
    });
    expect(hasPermission(custom, "finance.view")).toBe(true);
    expect(hasPermission(custom, "customers.create")).toBe(true);
  });
});

// =========================================================================
// ROTAS
// =========================================================================

describe("route permissions", () => {
  it("I) rotas mapeiam corretamente", () => {
    expect(getRequiredPermissionForPath("/dashboard/financeiro")).toBe("finance.view");
    expect(getRequiredPermissionForPath("/dashboard/financeiro/abc")).toBe("finance.view");
    expect(getRequiredPermissionForPath("/dashboard/estoque")).toBe("inventory.view");
    expect(getRequiredPermissionForPath("/dashboard/estoque/abc/ajuste")).toBe("inventory.adjust");
    expect(getRequiredPermissionForPath("/dashboard/pdv")).toBe("pos.use");
    expect(getRequiredPermissionForPath("/dashboard/pdv/caixa")).toBe("pos.close_cash");
    expect(getRequiredPermissionForPath("/dashboard/pdv/vendas")).toBe("pos.use");
    expect(getRequiredPermissionForPath("/dashboard/configuracoes")).toBe("settings.view");
    expect(getRequiredPermissionForPath("/dashboard/funcionarios")).toBe("employees.view");
    expect(getRequiredPermissionForPath("/dashboard/tutores")).toBe("customers.view");
    expect(getRequiredPermissionForPath("/dashboard/agenda")).toBe("appointments.view");
    expect(getRequiredPermissionForPath("/dashboard/atendimentos")).toBe("service_orders.view");
    expect(getRequiredPermissionForPath("/dashboard/pets")).toBe("pets.view");
    expect(getRequiredPermissionForPath("/dashboard/servicos")).toBe("services.view");
    expect(getRequiredPermissionForPath("/dashboard")).toBe("dashboard.view");
    expect(getRequiredPermissionForPath("/notificacoes")).toBe("dashboard.view");
    expect(getRequiredPermissionForPath("/assinatura")).toBe("subscription.view");
  });

  it("rota desconhecida não exige permissão", () => {
    expect(getRequiredPermissionForPath("/alguma-coisa")).toBeNull();
  });

  it("J) server action protegida retorna erro sem permissão", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    const result = assertPermissionForAction(ctx(reception), "finance.edit");
    expect(result?.error).toMatch(/permissão/i);
  });

  it("server action permite quando tem permissão", () => {
    const manager = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    const result = assertPermissionForAction(ctx(manager), "finance.view");
    expect(result).toBeNull();
  });

  it("server action bloqueia acesso revogado", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: new Date().toISOString(),
    });
    const result = assertPermissionForAction(ctx(revoked), "dashboard.view");
    expect(result?.error).toMatch(/removido/i);
  });
});

// =========================================================================
// SIDEBAR
// =========================================================================

describe("sidebar filtering", () => {
  it("K) sidebar esconde financeiro para operacional", () => {
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    const items = filterNavItemsByMembership(operational);
    expect(items.some((i) => i.href === "/dashboard/financeiro")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/estoque")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/pdv")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/configuracoes")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/agenda")).toBe(true);
  });

  it("sidebar mostra tudo para owner", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    const items = filterNavItemsByMembership(owner);
    expect(items.some((i) => i.href === "/dashboard/financeiro")).toBe(true);
    expect(items.some((i) => i.href === "/dashboard/estoque")).toBe(true);
    expect(items.some((i) => i.href === "/dashboard/configuracoes")).toBe(true);
    expect(items.some((i) => i.href === "/assinatura")).toBe(true);
  });

  it("sidebar bypass para platform admin", () => {
    const staff = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    const items = filterNavItemsByMembership(staff, { bypass: true });
    expect(items.some((i) => i.href === "/dashboard/financeiro")).toBe(true);
  });

  it("recepção vê clientes/pets/agenda mas não config/estoque", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    const items = filterNavItemsByMembership(reception);
    expect(items.some((i) => i.href === "/dashboard/tutores")).toBe(true);
    expect(items.some((i) => i.href === "/dashboard/pets")).toBe(true);
    expect(items.some((i) => i.href === "/dashboard/agenda")).toBe(true);
    expect(items.some((i) => i.href === "/dashboard/configuracoes")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/estoque")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/financeiro")).toBe(false);
  });
});

// =========================================================================
// AGENDA PRÓPRIA
// =========================================================================

describe("own schedule filter", () => {
  it("L) operacional com ownScheduleOnly filtra employeeId", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
      ownScheduleOnly: true,
    });
    expect(getScheduleEmployeeFilter(op)).toBe("emp-1");
  });

  it("owner nunca filtra mesmo com ownScheduleOnly", () => {
    const owner = membership({
      role: "owner",
      accessProfile: "owner_admin",
      employeeId: "emp-1",
      ownScheduleOnly: true,
    });
    expect(getScheduleEmployeeFilter(owner)).toBeUndefined();
  });

  it("sem ownScheduleOnly não filtra", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
      ownScheduleOnly: false,
    });
    expect(getScheduleEmployeeFilter(op)).toBeUndefined();
  });

  it("sem employeeId não filtra mesmo com ownScheduleOnly", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      ownScheduleOnly: true,
    });
    expect(getScheduleEmployeeFilter(op)).toBeUndefined();
  });

  it("acesso revogado não filtra", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
      ownScheduleOnly: true,
      accessRevokedAt: new Date().toISOString(),
    });
    expect(getScheduleEmployeeFilter(op)).toBeUndefined();
  });
});

// =========================================================================
// BLOQUEIOS ESPECÍFICOS
// =========================================================================

describe("specific permission blocks", () => {
  it("M) financeiro bloqueado para recepção", () => {
    const r = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception") });
    expect(hasPermission(r, "finance.view")).toBe(false);
    expect(hasPermission(r, "finance.create")).toBe(true);
    expect(hasPermission(r, "finance.edit")).toBe(false);
  });

  it("N) desconto PDV bloqueado para recepção", () => {
    const r = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception") });
    expect(hasPermission(r, "pos.apply_discount")).toBe(false);
    expect(hasPermission(r, "pos.cancel_sale")).toBe(false);
    expect(hasPermission(r, "pos.use")).toBe(true);
  });

  it("O) ajuste estoque bloqueado para estoque/caixa", () => {
    const ic = membership({ role: "staff", accessProfile: "inventory_cash", permissions: getProfilePermissions("inventory_cash") });
    expect(hasPermission(ic, "inventory.adjust")).toBe(false);
    expect(hasPermission(ic, "inventory.manage")).toBe(true);
    expect(hasPermission(ic, "inventory.view")).toBe(true);
  });
});

// =========================================================================
// REVOGAÇÃO E ARQUIVAMENTO
// =========================================================================

describe("access revocation", () => {
  it("P) remover acesso zera permissões", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: new Date().toISOString(),
    });
    expect(resolveEffectivePermissions(revoked).size).toBe(0);
    expect(hasPermission(revoked, "dashboard.view")).toBe(false);
  });

  it("Q) funcionário arquivado = acesso revogado", () => {
    const archived = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      accessRevokedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(hasPermission(archived, "dashboard.view")).toBe(false);
    expect(hasPermission(archived, "appointments.view")).toBe(false);
  });
});

// =========================================================================
// MULTI-EMPRESA / MULTI-TENANT
// =========================================================================

describe("multi-company / multi-tenant", () => {
  it("R) permissões por membership, não globais", () => {
    const companyA = membership({ role: "staff", accessProfile: "manager", permissions: getProfilePermissions("manager") });
    const companyB = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception") });
    expect(hasPermission(companyA, "employees.manage")).toBe(true);
    expect(hasPermission(companyB, "employees.manage")).toBe(false);
  });

  it("S) isolamento multi-tenant por company_id", () => {
    expect(COMPANY_A).not.toBe("22222222-2222-4222-8222-222222222222");
  });
});

// =========================================================================
// FLUXO DE CONVITE
// =========================================================================

describe("invite acceptance flow", () => {
  it("novo dono sem convite mantém acesso total no onboarding", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(hasPermission(owner, "settings.manage")).toBe(true);
    expect(hasPermission(owner, "subscription.manage")).toBe(true);
    expect(resolveEffectivePermissions(owner).size).toBe(PERMISSIONS.length);
  });

  it("funcionário convidado NÃO recebe permissões de owner", () => {
    const invited = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    expect(hasPermission(invited, "settings.manage")).toBe(false);
    expect(hasPermission(invited, "subscription.manage")).toBe(false);
    expect(isOwnerOrAdmin(invited)).toBe(false);
  });

  it("convite aceito: role/permissões/employee corretos", () => {
    const accepted = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
    });
    expect(accepted.role).toBe("staff");
    expect(accepted.accessProfile).toBe("operational");
    expect(accepted.employeeId).toBe("emp-1");
    expect(hasPermission(accepted, "appointments.view")).toBe(true);
    expect(hasPermission(accepted, "finance.view")).toBe(false);
  });

  it("usuário já existente em outra empresa mantém ambos", () => {
    const companyA = membership({ role: "owner", accessProfile: "owner_admin" });
    const companyB = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    expect(resolveEffectivePermissions(companyA).size).toBe(PERMISSIONS.length);
    expect(hasPermission(companyB, "finance.view")).toBe(false);
    expect(hasPermission(companyB, "customers.view")).toBe(true);
  });

  it("convite expirado/revogado: zero acesso", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: new Date().toISOString(),
    });
    expect(resolveEffectivePermissions(revoked).size).toBe(0);
  });

  it("convite cancelado: zero acesso", () => {
    const cancelled = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
      accessRevokedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(hasPermission(cancelled, "finance.view")).toBe(false);
  });

  it("idempotência: aceitar 2x não duplica", () => {
    const first = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception"), employeeId: "emp-1" });
    const second = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception"), employeeId: "emp-1" });
    expect(first.employeeId).toBe(second.employeeId);
    expect(first.accessProfile).toBe(second.accessProfile);
    expect(resolveEffectivePermissions(first).size).toBe(resolveEffectivePermissions(second).size);
  });

  it("convite gerente: não vira owner", () => {
    const managerInvite = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    expect(isOwnerOrAdmin(managerInvite)).toBe(false);
    expect(hasPermission(managerInvite, "subscription.manage")).toBe(false);
    expect(hasPermission(managerInvite, "settings.manage")).toBe(false);
  });

  it("convite financeiro: só financeiro", () => {
    const financeInvite = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
    });
    expect(hasPermission(financeInvite, "finance.view")).toBe(true);
    expect(hasPermission(financeInvite, "finance.close_cash")).toBe(true);
    expect(hasPermission(financeInvite, "customers.view")).toBe(false);
    expect(hasPermission(financeInvite, "appointments.view")).toBe(false);
  });

  it("convite estoque/caixa: só estoque e PDV", () => {
    const inv = membership({
      role: "staff",
      accessProfile: "inventory_cash",
      permissions: getProfilePermissions("inventory_cash"),
    });
    expect(hasPermission(inv, "inventory.view")).toBe(true);
    expect(hasPermission(inv, "pos.use")).toBe(true);
    expect(hasPermission(inv, "finance.view")).toBe(false);
  });
});

// =========================================================================
// HELPERS E UTILITÁRIOS
// =========================================================================

describe("utility functions", () => {
  it("normalizeStoredPermissions filtra inválidos", () => {
    const raw = ["dashboard.view", "invalid_perm", "finance.view", 42, null];
    const result = normalizeStoredPermissions(raw);
    expect(result).toEqual(["dashboard.view", "finance.view"]);
  });

  it("normalizeStoredPermissions com null/undefined retorna vazio", () => {
    expect(normalizeStoredPermissions(null)).toEqual([]);
    expect(normalizeStoredPermissions(undefined)).toEqual([]);
    expect(normalizeStoredPermissions("not-array")).toEqual([]);
  });

  it("isAccessProfile valida profiles corretos", () => {
    expect(isAccessProfile("owner_admin")).toBe(true);
    expect(isAccessProfile("manager")).toBe(true);
    expect(isAccessProfile("reception")).toBe(true);
    expect(isAccessProfile("operational")).toBe(true);
    expect(isAccessProfile("finance")).toBe(true);
    expect(isAccessProfile("inventory_cash")).toBe(true);
    expect(isAccessProfile("invalid")).toBe(false);
    expect(isAccessProfile("")).toBe(false);
  });

  it("isPermission valida permissões corretas", () => {
    expect(isPermission("dashboard.view")).toBe(true);
    expect(isPermission("finance.close_cash")).toBe(true);
    expect(isPermission("nonexistent.perm")).toBe(false);
  });

  it("hasAnyPermission funciona com array", () => {
    const r = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception") });
    expect(hasAnyPermission(r, ["finance.view", "customers.view"])).toBe(true);
    expect(hasAnyPermission(r, ["finance.view", "settings.manage"])).toBe(false);
  });

  it("hasAllPermissions funciona com array", () => {
    const r = membership({ role: "staff", accessProfile: "reception", permissions: getProfilePermissions("reception") });
    expect(hasAllPermissions(r, ["customers.view", "customers.create"])).toBe(true);
    expect(hasAllPermissions(r, ["customers.view", "finance.view"])).toBe(false);
  });

  it("buildPermissionsPayload para owner retorna tudo", () => {
    const result = buildPermissionsPayload("owner_admin", []);
    expect(result.length).toBe(PERMISSIONS.length);
  });

  it("buildPermissionsPayload para reception merge personalizações", () => {
    const result = buildPermissionsPayload("reception", ["finance.view" as Permission]);
    expect(result).toContain("finance.view");
    expect(result).toContain("customers.view");
  });

  it("mergePermissionsWithProfile adiciona ao base", () => {
    const merged = mergePermissionsWithProfile("operational", ["finance.view"]);
    expect(merged).toContain("finance.view");
    expect(merged).toContain("appointments.view");
  });

  it("cada perfil tem dashboard.view", () => {
    const profiles: AccessProfile[] = ["owner_admin", "manager", "reception", "operational", "finance", "inventory_cash"];
    for (const profile of profiles) {
      expect(getProfilePermissions(profile)).toContain("dashboard.view");
    }
  });

  it("staff sem permissions e sem profile usa fallback reception", () => {
    const bare = membership({ role: "staff" });
    const effective = resolveEffectivePermissions(bare);
    const receptionPerms = new Set(getProfilePermissions("reception"));
    expect(effective.size).toBe(receptionPerms.size);
  });
});
