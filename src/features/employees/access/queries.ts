import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AccessProfile, Permission } from "@/lib/auth/permissions";
import { normalizeStoredPermissions } from "@/lib/auth/permissions";

export type EmployeeAccessState = {
  hasAccess: boolean;
  accessRevokedAt: string | null;
  accessProfile: AccessProfile | null;
  permissions: Permission[];
  ownScheduleOnly: boolean;
  linkedUserId: string | null;
  linkedEmail: string | null;
  pendingInvite: {
    id: string;
    email: string;
    accessProfile: AccessProfile;
    permissions: Permission[];
    ownScheduleOnly: boolean;
    expiresAt: string;
    isExpired: boolean;
  } | null;
};

export async function getEmployeeAccessState(
  companyId: string,
  employeeId: string,
): Promise<EmployeeAccessState> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const [memberResult, employeeResult, inviteResult] = await Promise.all([
    supabase
      .from("company_members")
      .select(
        "user_id, access_profile, permissions, access_revoked_at, own_schedule_only",
      )
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("user_id, email")
      .eq("company_id", companyId)
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("company_member_invites")
      .select(
        "id, email, access_profile, permissions, own_schedule_only, expires_at, status",
      )
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .in("status", ["pending", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const member = memberResult.data;
  const employee = employeeResult.data;
  const invite = inviteResult.data;

  const hasActiveAccess = Boolean(member && member.access_revoked_at === null);
  const inviteExpired =
    Boolean(invite) &&
    (invite?.status === "expired" ||
      (invite?.status === "pending" && new Date(invite.expires_at).getTime() <= Date.now()));

  const pendingInvite =
    invite && (invite.status === "pending" || invite.status === "expired")
      ? {
          id: invite.id,
          email: invite.email,
          accessProfile: invite.access_profile as AccessProfile,
          permissions: normalizeStoredPermissions(invite.permissions),
          ownScheduleOnly: invite.own_schedule_only,
          expiresAt: invite.expires_at,
          isExpired: inviteExpired,
        }
      : null;

  return {
    hasAccess: hasActiveAccess,
    accessRevokedAt: member?.access_revoked_at ?? null,
    accessProfile: (member?.access_profile as AccessProfile | null) ?? null,
    permissions: normalizeStoredPermissions(
      member?.permissions ?? (pendingInvite && !pendingInvite.isExpired ? invite?.permissions : null),
    ),
    ownScheduleOnly:
      member?.own_schedule_only ??
      (pendingInvite && !pendingInvite.isExpired ? pendingInvite.ownScheduleOnly : false),
    linkedUserId: employee?.user_id ?? member?.user_id ?? null,
    linkedEmail: employee?.email ?? invite?.email ?? null,
    pendingInvite: hasActiveAccess ? null : pendingInvite,
  };
}
