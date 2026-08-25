import { unstable_noStore as noStore } from "next/cache";

import { buildOnboardingSnapshot } from "@/features/onboarding-tour/steps";
import type {
  OnboardingActivationCounts,
  OnboardingProgressRow,
  OnboardingSnapshot,
} from "@/features/onboarding-tour/types";
import { countActiveCustomers } from "@/features/customers/queries";
import { countActivePets } from "@/features/pets/queries";
import { countActiveEmployees } from "@/features/employees/queries";
import { countActiveServices } from "@/features/services/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProgressDbRow = {
  id: string;
  company_id: string;
  user_id: string;
  onboarding_started_at: string | null;
  welcome_seen_at: string | null;
  guided_started_at: string | null;
  guided_skipped_at: string | null;
  guided_active: boolean;
  last_guided_step: string | null;
  workflow_step_viewed_at: string | null;
  finance_step_viewed_at: string | null;
  onboarding_completed_at: string | null;
  checklist_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapOnboardingProgressRow(row: ProgressDbRow): OnboardingProgressRow {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    onboardingStartedAt: row.onboarding_started_at,
    welcomeSeenAt: row.welcome_seen_at,
    guidedStartedAt: row.guided_started_at,
    guidedSkippedAt: row.guided_skipped_at,
    guidedActive: row.guided_active,
    lastGuidedStep: row.last_guided_step,
    workflowStepViewedAt: row.workflow_step_viewed_at,
    financeStepViewedAt: row.finance_step_viewed_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    checklistDismissedAt: row.checklist_dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function countCompanyAppointments(companyId: string): Promise<number> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .neq("status", "cancelled");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function getOnboardingActivationCounts(
  companyId: string,
): Promise<OnboardingActivationCounts> {
  noStore();
  const [services, employees, customers, pets, appointments] = await Promise.all([
    countActiveServices(companyId),
    countActiveEmployees(companyId),
    countActiveCustomers(companyId),
    countActivePets(companyId),
    countCompanyAppointments(companyId),
  ]);

  return { services, employees, customers, pets, appointments };
}

/**
 * Carrega progresso do usuário na empresa.
 * Se a tabela ainda não existir no remoto, retorna null (fallback legado).
 */
export async function getOnboardingProgress(
  companyId: string,
  userId: string,
): Promise<OnboardingProgressRow | null> {
  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("onboarding_progress")
    .select(
      "id, company_id, user_id, onboarding_started_at, welcome_seen_at, guided_started_at, guided_skipped_at, guided_active, last_guided_step, workflow_step_viewed_at, finance_step_viewed_at, onboarding_completed_at, checklist_dismissed_at, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Tabela/coluna ausente ou RLS — degradar sem quebrar o dashboard.
    if (process.env.NODE_ENV === "development") {
      console.info("[onboarding_progress] load skipped:", error.message);
    }
    return null;
  }

  if (!data) {
    return null;
  }

  return mapOnboardingProgressRow(data as ProgressDbRow);
}

export async function loadOnboardingSnapshot(input: {
  companyId: string;
  userId: string;
  legacyTutorialCompletedAt: string | null;
}): Promise<OnboardingSnapshot> {
  const [counts, progress] = await Promise.all([
    getOnboardingActivationCounts(input.companyId),
    getOnboardingProgress(input.companyId, input.userId),
  ]);

  return buildOnboardingSnapshot({
    counts,
    progress,
    legacyTutorialCompletedAt: input.legacyTutorialCompletedAt,
  });
}
