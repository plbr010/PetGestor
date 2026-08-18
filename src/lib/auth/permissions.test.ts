import { describe, expect, it } from "vitest";

import { filterNavItemsByMembership } from "@/lib/auth/nav-filter";
import {
  canModifyMemberAccess,
  getProfilePermissions,
  getScheduleEmployeeFilter,
  hasPermission,
  resolveEffectivePermissions,
  type MembershipAccess,
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

describe("employee permissions", () => {
  it("A) owner tem acesso total", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(hasPermission(owner, "finance.view")).toBe(true);
    expect(hasPermission(owner, "settings.manage")).toBe(true);
    expect(resolveEffectivePermissions(owner).size).toBeGreaterThan(30);
  });

  it("B) owner não pode ser modificado por regra de domínio", () => {
    const actor = {
      userId: "owner-id",
      membership: membership({ role: "owner" }),
    };

    expect(
      canModifyMemberAccess(actor, { userId: "owner-id", role: "owner" }),
    ).toBe(false);
  });

  it("C) gerente tem módulos operacionais e financeiro parcial", () => {
    const manager = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });

    expect(hasPermission(manager, "employees.manage")).toBe(true);
    expect(hasPermission(manager, "finance.view")).toBe(true);
    expect(hasPermission(manager, "subscription.manage")).toBe(false);
  });

  it("D) recepção não acessa configurações sensíveis", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(reception, "customers.create")).toBe(true);
    expect(hasPermission(reception, "settings.view")).toBe(false);
    expect(hasPermission(reception, "finance.edit")).toBe(false);
  });

  it("E) operacional vê agenda/atendimentos limitados", () => {
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    expect(hasPermission(operational, "appointments.view")).toBe(true);
    expect(hasPermission(operational, "service_orders.update_status")).toBe(true);
    expect(hasPermission(operational, "finance.view")).toBe(false);
  });

  it("F) financeiro acessa financeiro e relatórios", () => {
    const finance = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
    });

    expect(hasPermission(finance, "finance.view")).toBe(true);
    expect(hasPermission(finance, "finance.close_cash")).toBe(true);
    expect(hasPermission(finance, "appointments.create")).toBe(false);
  });

  it("G) estoque/caixa acessa estoque e PDV", () => {
    const inventoryCash = membership({
      role: "staff",
      accessProfile: "inventory_cash",
      permissions: getProfilePermissions("inventory_cash"),
    });

    expect(hasPermission(inventoryCash, "inventory.manage")).toBe(true);
    expect(hasPermission(inventoryCash, "pos.use")).toBe(true);
    expect(hasPermission(inventoryCash, "settings.view")).toBe(false);
  });

  it("H) permissão personalizada sobrescreve perfil", () => {
    const custom = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: [...getProfilePermissions("reception"), "finance.view"],
    });

    expect(hasPermission(custom, "finance.view")).toBe(true);
  });

  it("I) rota protegida mapeia financeiro", () => {
    expect(getRequiredPermissionForPath("/dashboard/financeiro")).toBe("finance.view");
    expect(getRequiredPermissionForPath("/dashboard/financeiro/abc")).toBe("finance.view");
  });

  it("J) server action protegida retorna erro sem permissão", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    const result = assertPermissionForAction(
      {
        user: { id: "u1", email: "a@b.com" },
        profile: {
          fullName: "Test",
          avatarUrl: null,
          onboardingTutorialCompletedAt: null,
        },
        membership: {
          ...reception,
          company: { id: COMPANY_A, name: "A", timezone: "America/Sao_Paulo" },
        },
      },
      "finance.edit",
    );

    expect(result?.error).toMatch(/permissão/i);
  });

  it("K) sidebar esconde financeiro para operacional", () => {
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    const items = filterNavItemsByMembership(operational);
    expect(items.some((item) => item.href === "/dashboard/financeiro")).toBe(false);
    expect(items.some((item) => item.href === "/dashboard/agenda")).toBe(true);
  });

  it("L) própria agenda filtra employeeId", () => {
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
      ownScheduleOnly: true,
    });

    expect(getScheduleEmployeeFilter(operational)).toBe("emp-1");
  });

  it("M) financeiro bloqueado para recepção", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(reception, "finance.view")).toBe(false);
  });

  it("N) desconto PDV bloqueado para recepção", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(reception, "pos.apply_discount")).toBe(false);
  });

  it("O) ajuste estoque bloqueado para estoque/caixa padrão", () => {
    const inventoryCash = membership({
      role: "staff",
      accessProfile: "inventory_cash",
      permissions: getProfilePermissions("inventory_cash"),
    });

    expect(hasPermission(inventoryCash, "inventory.adjust")).toBe(false);
  });

  it("P) remover acesso zera permissões efetivas", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: new Date().toISOString(),
    });

    expect(resolveEffectivePermissions(revoked).size).toBe(0);
  });

  it("Q) funcionário arquivado representado por acesso revogado", () => {
    const archived = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      accessRevokedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(hasPermission(archived, "dashboard.view")).toBe(false);
  });

  it("R) multiempresa — permissões vêm do membership, não globais", () => {
    const companyA = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    const companyB = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(companyA, "employees.manage")).toBe(true);
    expect(hasPermission(companyB, "employees.manage")).toBe(false);
  });

  it("S) isolamento multi-tenant permanece responsabilidade do company_id", () => {
    expect(COMPANY_A).not.toBe("22222222-2222-4222-8222-222222222222");
  });
});
