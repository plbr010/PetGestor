import { describe, expect, it } from "vitest";

import {
  getProfilePermissions,
  hasPermission,
  resolveEffectivePermissions,
  type MembershipAccess,
} from "@/lib/auth/permissions";

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

describe("invite acceptance flow", () => {
  it("new owner without invite should still get full access on onboarding", () => {
    const owner = membership({ role: "owner", accessProfile: "owner_admin" });
    expect(hasPermission(owner, "settings.manage")).toBe(true);
    expect(hasPermission(owner, "subscription.manage")).toBe(true);
  });

  it("invited employee should NOT get owner permissions", () => {
    const invited = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });
    expect(hasPermission(invited, "settings.manage")).toBe(false);
    expect(hasPermission(invited, "subscription.manage")).toBe(false);
  });

  it("invite acceptance creates correct role and permissions", () => {
    const accepted = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      employeeId: "emp-1",
    });

    expect(hasPermission(accepted, "appointments.view")).toBe(true);
    expect(hasPermission(accepted, "service_orders.update_status")).toBe(true);
    expect(hasPermission(accepted, "finance.view")).toBe(false);
    expect(accepted.employeeId).toBe("emp-1");
  });

  it("user with existing membership in another company keeps both", () => {
    const companyA = membership({
      role: "owner",
      accessProfile: "owner_admin",
    });
    const companyB = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
    });

    expect(resolveEffectivePermissions(companyA).size).toBeGreaterThan(30);
    expect(hasPermission(companyB, "finance.view")).toBe(false);
    expect(hasPermission(companyB, "customers.view")).toBe(true);
  });

  it("expired/revoked invite yields no access", () => {
    const revoked = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
      accessRevokedAt: new Date().toISOString(),
    });

    expect(resolveEffectivePermissions(revoked).size).toBe(0);
  });

  it("idempotent: accepting twice should not duplicate (same membership)", () => {
    const first = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      employeeId: "emp-1",
    });
    const second = membership({
      role: "staff",
      accessProfile: "reception",
      permissions: getProfilePermissions("reception"),
      employeeId: "emp-1",
    });

    expect(first.employeeId).toBe(second.employeeId);
    expect(first.accessProfile).toBe(second.accessProfile);
  });

  it("multi-tenant isolation: permissions are per-membership", () => {
    const manager = membership({
      role: "staff",
      accessProfile: "manager",
      permissions: getProfilePermissions("manager"),
    });
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    expect(hasPermission(manager, "employees.manage")).toBe(true);
    expect(hasPermission(operational, "employees.manage")).toBe(false);
  });
});
