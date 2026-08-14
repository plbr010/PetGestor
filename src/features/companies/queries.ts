import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompanyMembership,
  DashboardContext,
  UserContext,
  UserProfile,
} from "@/features/auth/types";

function mapProfile(
  row: {
    full_name: string;
    avatar_url: string | null;
    onboarding_tutorial_completed_at: string | null;
  } | null,
): UserProfile | null {
  if (!row) {
    return null;
  }

  return {
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    onboardingTutorialCompletedAt: row.onboarding_tutorial_completed_at,
  };
}

async function loadMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<CompanyMembership | null> {
  const { data: memberRow, error: memberError } = await supabase
    .from("company_members")
    .select("role, company_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  return {
    role: memberRow.role,
    company: {
      id: companyRow.id,
      name: companyRow.name,
      timezone: companyRow.timezone ?? "America/Sao_Paulo",
    },
  };
}

function logMembershipDiagnostic(step: string, code: string, message: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[membership:${step}]`, code, message);
}

export async function getUserContext(userId: string): Promise<Omit<UserContext, "user">> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const [profileResult, membership] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, onboarding_tutorial_completed_at")
      .eq("id", userId)
      .maybeSingle(),
    loadMembership(supabase, userId),
  ]);

  if (profileResult.error) {
    logMembershipDiagnostic("profiles_select", profileResult.error.code, profileResult.error.message);
  }

  return {
    profile: mapProfile(profileResult.data),
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
