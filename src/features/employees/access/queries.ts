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
        "id, email, access_profile, permissions, own_schedule_only, expires_at",
      )
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  const member = memberResult.data;
  const employee = employeeResult.data;
  const invite = inviteResult.data;

  const hasActiveAccess = Boolean(member && member.access_revoked_at === null);

  return {
    hasAccess: hasActiveAccess,
    accessRevokedAt: member?.access_revoked_at ?? null,
    accessProfile: (member?.access_profile as AccessProfile | null) ?? null,
    permissions: normalizeStoredPermissions(member?.permissions ?? invite?.permissions),
    ownScheduleOnly: member?.own_schedule_only ?? invite?.own_schedule_only ?? false,
    linkedUserId: employee?.user_id ?? member?.user_id ?? null,
    linkedEmail: employee?.email ?? invite?.email ?? null,
    pendingInvite: invite
      ? {
          id: invite.id,
          email: invite.email,
          accessProfile: invite.access_profile as AccessProfile,
          permissions: normalizeStoredPermissions(invite.permissions),
          ownScheduleOnly: invite.own_schedule_only,
          expiresAt: invite.expires_at,
        }
      : null,
  };
}
