import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import {
  isAccessProfile,
  normalizeStoredPermissions,
  type AccessProfile,
} from "@/lib/auth/permissions";
import { resolveCompanyTimeZone } from "@/lib/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompanyMembership,
  DashboardContext,
  UserContext,
  UserProfile,
} from "@/features/auth/types";

type ProfileRow = {
  full_name: string;
  avatar_url: string | null;
  onboarding_tutorial_completed_at?: string | null;
};

export function mapProfile(row: ProfileRow | null): UserProfile | null {
  if (!row) {
    return null;
  }

  return {
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    // Coluna ausente (migration pendente) → trata como concluído para não quebrar o app
    onboardingTutorialCompletedAt:
      row.onboarding_tutorial_completed_at === undefined
        ? "1970-01-01T00:00:00.000Z"
        : row.onboarding_tutorial_completed_at,
  };
}

type MembershipRow = {
  role: CompanyMembership["role"];
  company_id: string;
  access_profile: string | null;
  permissions: unknown;
  access_revoked_at: string | null;
  employee_id: string | null;
  own_schedule_only: boolean | null;
};

function mapMembershipRow(
  memberRow: MembershipRow,
  companyRow: { id: string; name: string; timezone: string | null },
): CompanyMembership {
  const accessProfile =
    memberRow.access_profile && isAccessProfile(memberRow.access_profile)
      ? (memberRow.access_profile as AccessProfile)
      : memberRow.role === "owner" || memberRow.role === "admin"
        ? "owner_admin"
        : null;

  return {
    role: memberRow.role,
    company: {
      id: companyRow.id,
      name: companyRow.name,
      timezone: resolveCompanyTimeZone(companyRow.timezone),
    },
    accessProfile,
    permissions: normalizeStoredPermissions(memberRow.permissions),
    accessRevokedAt: memberRow.access_revoked_at,
    employeeId: memberRow.employee_id,
    ownScheduleOnly: memberRow.own_schedule_only ?? false,
  };
}

async function loadMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<CompanyMembership | null> {
  const withPermissions = await supabase
    .from("company_members")
    .select(
      "role, company_id, access_profile, permissions, access_revoked_at, employee_id, own_schedule_only",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let memberRow = withPermissions.data;
  let memberError = withPermissions.error;

  if (memberError) {
    logMembershipDiagnostic(
      "company_members_select_permissions",
      memberError.code,
      memberError.message,
    );

    const fallback = await supabase
      .from("company_members")
      .select("role, company_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    memberRow = fallback.data
      ? {
          ...fallback.data,
          access_profile:
            fallback.data.role === "owner" || fallback.data.role === "admin"
              ? "owner_admin"
              : "reception",
          permissions: [],
          access_revoked_at: null,
          employee_id: null,
          own_schedule_only: false,
        }
      : null;
    memberError = fallback.error;
  }

  if (memberError) {
    logMembershipDiagnostic("company_members_select", memberError.code, memberError.message);
    return null;
  }

  if (!memberRow) {
    return null;
  }

  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("id, name, timezone")
    .eq("id", memberRow.company_id)
    .maybeSingle();

  if (companyError) {
    logMembershipDiagnostic("companies_select", companyError.code, companyError.message);
    return null;
  }

  if (!companyRow) {
    logMembershipDiagnostic("companies_missing", "PGRST116", "company row not readable");
    return null;
  }

  return mapMembershipRow(memberRow as MembershipRow, companyRow);
}

function logMembershipDiagnostic(step: string, code: string, message: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[membership:${step}]`, code, message);
}

/**
 * Carrega o profile com fallback se a migration do tutorial ainda não existir.
 * Evita loop /dashboard ↔ /onboarding quando a coluna nova ainda não está no banco.
 */
export async function loadProfileForUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<UserProfile | null> {
  const withTutorial = await supabase
    .from("profiles")
    .select("full_name, avatar_url, onboarding_tutorial_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (!withTutorial.error) {
    return mapProfile(withTutorial.data as ProfileRow | null);
  }

  logMembershipDiagnostic(
    "profiles_select_tutorial_column",
    withTutorial.error.code,
    withTutorial.error.message,
  );

  const fallback = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error) {
    logMembershipDiagnostic("profiles_select", fallback.error.code, fallback.error.message);
    return null;
  }

  if (!fallback.data) {
    return null;
  }

  return mapProfile({
    full_name: fallback.data.full_name,
    avatar_url: fallback.data.avatar_url,
    // undefined → mapProfile marca tutorial como já concluído
  });
}

export async function getUserContext(userId: string): Promise<Omit<UserContext, "user">> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const [profile, membership] = await Promise.all([
    loadProfileForUser(supabase, userId),
    loadMembership(supabase, userId),
  ]);

  return {
    profile,
    membership,
  };
}

export async function getCurrentCompanyMembership(
  userId: string,
): Promise<CompanyMembership | null> {
  const context = await getUserContext(userId);
  return context.membership;
}

export async function loadUserContext(userId: string, email: string | null): Promise<UserContext> {
  const context = await getUserContext(userId);

  return {
    user: { id: userId, email },
    ...context,
  };
}

export async function requireCompany(userId: string): Promise<DashboardContext> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getClaims();
  const emailClaim = authData?.claims?.email;
  const email = typeof emailClaim === "string" ? emailClaim : null;

  const context = await loadUserContext(userId, email);

  if (!context.profile || !context.membership) {
    redirect("/onboarding");
  }

  return {
    user: context.user,
    profile: context.profile,
    membership: context.membership,
  };
}
