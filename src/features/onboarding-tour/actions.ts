"use server";

import { revalidatePath } from "next/cache";

import { requireCompany } from "@/features/companies/queries";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapOnboardingProgressRow } from "@/features/onboarding-tour/queries";
import type { OnboardingProgressRow } from "@/features/onboarding-tour/types";

export type OnboardingTourActionState = {
  error?: string;
  success?: boolean;
  progress?: OnboardingProgressRow | null;
};

type ProgressPatch = {
  mark_started?: boolean;
  welcome_seen?: boolean;
  guided_started?: boolean;
  guided_skipped?: boolean;
  guided_active?: boolean;
  restart_guided?: boolean;
  last_guided_step?: string | null;
  workflow_viewed?: boolean;
  finance_viewed?: boolean;
  completed?: boolean;
  checklist_dismissed?: boolean;
};

async function applyProgressPatch(
  companyId: string,
  patch: ProgressPatch,
): Promise<OnboardingTourActionState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_onboarding_progress", {
    p_company_id: companyId,
    p_patch: patch,
  });

  if (error) {
    // Fallback se migration nova ainda não aplicada no remoto.
    if (patch.completed || patch.checklist_dismissed) {
      const legacy = await supabase.rpc("complete_onboarding_tutorial");
      if (legacy.error) {
        return { error: "Não foi possível salvar o progresso do tutorial." };
      }
      revalidateDashboard();
      return { success: true, progress: null };
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[onboarding_progress] upsert skipped:", error.message);
    }

    // Welcome / skip / step: UI local continua; checklist usa dados reais.
    revalidateDashboard();
    return { success: true, progress: null };
  }

  revalidateDashboard();

  return {
    success: true,
    progress: data
      ? mapOnboardingProgressRow(data as Parameters<typeof mapOnboardingProgressRow>[0])
      : null,
  };
}

function revalidateDashboard() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
}

/**
 * Marca o tutorial como concluído/pulado (compatível com tour legado).
 * Não aceita user_id do cliente — usa auth.uid() via RPC.
 */
export async function completeOnboardingTutorialAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    welcome_seen: true,
    guided_active: false,
    completed: true,
    checklist_dismissed: true,
  });
}

export async function dismissOnboardingWelcomeAction(
  mode: "start" | "explore",
): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);

  if (mode === "start") {
    return applyProgressPatch(context.membership.company.id, {
      mark_started: true,
      welcome_seen: true,
      guided_started: true,
      guided_active: true,
      last_guided_step: "service",
    });
  }

  return applyProgressPatch(context.membership.company.id, {
    mark_started: true,
    welcome_seen: true,
    guided_active: false,
  });
}

export async function skipGuidedOnboardingAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    welcome_seen: true,
    guided_skipped: true,
    guided_active: false,
  });
}

export async function setGuidedStepAction(
  stepId: string,
): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    last_guided_step: stepId,
    guided_active: true,
  });
}

export async function markWorkflowStepViewedAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    workflow_viewed: true,
  });
}

export async function markFinanceStepViewedAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    finance_viewed: true,
  });
}

export async function completeActivationOnboardingAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    welcome_seen: true,
    guided_active: false,
    completed: true,
    workflow_viewed: true,
    finance_viewed: true,
  });
}

export async function dismissOnboardingChecklistAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    checklist_dismissed: true,
    completed: true,
  });
}

export async function restartGuidedOnboardingAction(): Promise<OnboardingTourActionState> {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  return applyProgressPatch(context.membership.company.id, {
    restart_guided: true,
    guided_active: true,
    welcome_seen: true,
    last_guided_step: "service",
  });
}
