import { describe, expect, it } from "vitest";

import {
  getProfilePermissions,
  getScheduleEmployeeFilter,
  hasPermission,
  isOwnerOrAdmin,
  PERMISSIONS,
  resolveEffectivePermissions,
  type MembershipAccess,
} from "@/lib/auth/permissions";
import { getRequiredPermissionForPath } from "@/lib/auth/route-permissions";
import { assertPermissionForAction } from "@/lib/auth/require-permission";
import { filterNavItemsByMembership } from "@/lib/auth/nav-filter";

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

function ctx(m: MembershipAccess, companyId = COMPANY_A) {
  return {
    user: { id: "u1", email: "func@email.com" },
    profile: { fullName: "Funcionário", avatarUrl: null, onboardingTutorialCompletedAt: null },
    membership: { ...m, company: { id: companyId, name: "Pet Shop", timezone: "America/Sao_Paulo" } },
  };
}

describe("invite flow: new owner without invite", () => {
  it("novo dono cria empresa e fica com acesso total", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(resolveEffectivePermissions(owner).size).toBe(PERMISSIONS.length);
    expect(isOwnerOrAdmin(owner)).toBe(true);
  });
});

describe("invite flow: invited employee does not create company", () => {
  it("funcionário convidado tem role staff, NÃO owner", () => {
    const invited = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      employeeId: "emp-1",
    });
    expect(invited.role).toBe("staff");
    expect(isOwnerOrAdmin(invited)).toBe(false);
  });

  it("convidado não vê assinatura/config no menu", () => {
    const invited = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    const items = filterNavItemsByMembership(invited);
    expect(items.some((i) => i.href === "/assinatura")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/configuracoes")).toBe(false);
  });

  it("convidado não acessa configurações via server action", () => {
    const invited = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    const result = assertPermissionForAction(ctx(invited), "settings.manage");
    expect(result?.error).toBeTruthy();
  });
});

describe("invite flow: invite is accepted correctly", () => {
  it("permissões do perfil aplicadas", () => {
    const accepted = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-42",
    });
    expect(hasPermission(accepted, "appointments.view")).toBe(true);
    expect(hasPermission(accepted, "service_orders.update_status")).toBe(true);
    expect(hasPermission(accepted, "finance.view")).toBe(false);
  });

  it("employeeId está vinculado", () => {
    const accepted = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      employeeId: "emp-99",
    });
    expect(accepted.employeeId).toBe("emp-99");
  });

  it("ownScheduleOnly funciona com invite", () => {
    const accepted = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-5",
      ownScheduleOnly: true,
    });
    expect(accepted.ownScheduleOnly).toBe(true);
  });
});

describe("invite flow: correct role/permissions per profile", () => {
  const profiles = [
    { profile: "manager" as const, has: ["employees.manage", "finance.view"] as const, not: ["subscription.manage", "settings.manage"] as const },
    { profile: "reception" as const, has: ["customers.create", "pos.use"] as const, not: ["finance.view", "settings.view"] as const },
    { profile: "operational" as const, has: ["appointments.view", "pets.view"] as const, not: ["finance.view", "pos.use"] as const },
    { profile: "finance" as const, has: ["finance.view", "finance.close_cash"] as const, not: ["customers.view", "appointments.create"] as const },
    { profile: "inventory_cash" as const, has: ["inventory.manage", "pos.use"] as const, not: ["finance.view", "settings.view"] as const },
  ];

  for (const { profile, has, not } of profiles) {
    it(`perfil ${profile}: permissões esperadas`, () => {
      const m = membership({
        role: "staff",
        accessProfile: profile,
        permissions: getProfilePermissions(profile),
      });
      for (const perm of has) {
        expect(hasPermission(m, perm)).toBe(true);
      }
      for (const perm of not) {
        expect(hasPermission(m, perm)).toBe(false);
      }
    });
  }
});

describe("invite flow: employee/user binding", () => {
  it("employee sem employeeId não filtra agenda", () => {
    const m = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      ownScheduleOnly: true,
    });
    expect(getScheduleEmployeeFilter(m)).toBeUndefined();
  });
});

describe("invite flow: existing user in another company", () => {
  it("usuário mantém permissões de ambas empresas separadas", () => {
    const asOwner = membership({ role: "owner", accessProfile: "owner_admin" });
    const asStaff = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    expect(resolveEffectivePermissions(asOwner).size).toBe(PERMISSIONS.length);
    expect(resolveEffectivePermissions(asStaff).size).toBeLessThan(PERMISSIONS.length);
    expect(hasPermission(asStaff, "settings.manage")).toBe(false);
  });
});

describe("invite flow: expired invite", () => {
  it("convite expirado resulta em acesso revogado = zero permissões", () => {
    const expired = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(resolveEffectivePermissions(expired).size).toBe(0);
  });
});

describe("invite flow: cancelled invite", () => {
  it("convite cancelado/revogado = zero permissões", () => {
    const cancelled = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
      accessRevokedAt: new Date().toISOString(),
    });
    expect(hasPermission(cancelled, "finance.view")).toBe(false);
  });
});

describe("invite flow: idempotency", () => {
  it("aceitar 2x produz o mesmo resultado", () => {
    const perms = getProfilePermissions("reception");
    const first = membership({ role: "staff", accessProfile: "reception", permissions: perms, employeeId: "emp-1" });
    const second = membership({ role: "staff", accessProfile: "reception", permissions: perms, employeeId: "emp-1" });
    expect(resolveEffectivePermissions(first)).toEqual(resolveEffectivePermissions(second));
  });
});

describe("invite flow: multi-tenant isolation", () => {
  it("permissões de company A não vazam para company B", () => {
    const managerA = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    const opB = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    expect(hasPermission(managerA, "employees.manage")).toBe(true);
    expect(hasPermission(opB, "employees.manage")).toBe(false);
  });

  it("rotas protegem corretamente ambas empresas", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });
    const permission = getRequiredPermissionForPath("/dashboard/financeiro");
    expect(permission).toBe("finance.view");
    expect(hasPermission(op, permission!)).toBe(false);
  });
});

describe("invite flow: protected routes block invited employee", () => {
  it("convidado operacional bloqueado em /financeiro, /estoque, /configuracoes", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    for (const path of ["/dashboard/financeiro", "/dashboard/estoque", "/dashboard/configuracoes", "/dashboard/pdv"]) {
      const required = getRequiredPermissionForPath(path)!;
      expect(hasPermission(op, required)).toBe(false);
    }
  });

  it("convidado operacional permitido em /agenda, /atendimentos, /pets", () => {
    const op = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    for (const path of ["/dashboard/agenda", "/dashboard/atendimentos", "/dashboard/pets"]) {
      const required = getRequiredPermissionForPath(path)!;
      expect(hasPermission(op, required)).toBe(true);
    }
  });
});

describe("invite acceptance reasons (UX)", () => {
  it("mensagens de expiração e cancelamento são claras", async () => {
    const { mapInviteAcceptReason } = await import("@/features/employees/access/invite-messages");

    expect(mapInviteAcceptReason("invite_expired")).toContain("expirou");
    expect(mapInviteAcceptReason("invite_revoked")).toContain("cancelado");
    expect(mapInviteAcceptReason("employee_already_linked")).toContain("vinculado");
    expect(mapInviteAcceptReason("no_pending_invite")).toContain("convite");
  });

  it("recepção recebe exatamente as permissões do perfil (K)", () => {
    const reception = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(reception, "customers.view")).toBe(true);
    expect(hasPermission(reception, "pets.create")).toBe(true);
    expect(hasPermission(reception, "appointments.create")).toBe(true);
    expect(hasPermission(reception, "service_orders.view")).toBe(true);
    expect(hasPermission(reception, "finance.view")).toBe(false);
    expect(hasPermission(reception, "subscription.manage")).toBe(false);
    expect(hasPermission(reception, "settings.manage")).toBe(false);
  });

  it("remover acesso zera permissões efetivas (I)", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      accessRevokedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(resolveEffectivePermissions(revoked).size).toBe(0);
  });

  it("memberships de empresas diferentes são independentes (H)", () => {
    const shopA = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    const shopB = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(hasPermission(shopA, "employees.manage")).toBe(true);
    expect(hasPermission(shopB, "employees.manage")).toBe(false);
    expect(hasPermission(shopB, "customers.create")).toBe(true);
  });
});
