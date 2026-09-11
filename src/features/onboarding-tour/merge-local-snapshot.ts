import { buildOnboardingSnapshot } from "@/features/onboarding-tour/steps";
import type { LocalOnboardingFlags } from "@/features/onboarding-tour/local-progress";
import type { OnboardingProgressRow, OnboardingSnapshot } from "@/features/onboarding-tour/types";

/**
 * localStorage só preenche lacunas de UX (último passo).
 * Conclusão, dismiss e guidedActive persistidos no servidor prevalecem.
 */
export function mergeLocalIntoSnapshot(
  base: OnboardingSnapshot,
  companyId: string,
  userId: string,
  local: LocalOnboardingFlags,
): OnboardingSnapshot {
  if (Object.keys(local).length === 0) {
    return base;
  }

  if (base.isFullyComplete || base.progress?.onboardingCompletedAt) {
    return base;
  }

  const now = new Date().toISOString();
  const progress: OnboardingProgressRow = {
    id: base.progress?.id ?? "local",
    companyId,
    userId,
    onboardingStartedAt: base.progress?.onboardingStartedAt ?? now,
    welcomeSeenAt: base.progress?.welcomeSeenAt ?? (local.welcomeSeen ? now : null),
    guidedStartedAt: base.progress?.guidedStartedAt ?? null,
    guidedSkippedAt: base.progress?.guidedSkippedAt ?? (local.guidedSkipped ? now : null),
    guidedActive: base.progress?.guidedActive ?? false,
    lastGuidedStep: base.progress?.lastGuidedStep ?? local.lastGuidedStep ?? null,
    workflowStepViewedAt:
      base.progress?.workflowStepViewedAt ?? (local.workflowViewed ? now : null),
    financeStepViewedAt:
      base.progress?.financeStepViewedAt ?? (local.financeViewed ? now : null),
    onboardingCompletedAt: base.progress?.onboardingCompletedAt ?? null,
    checklistDismissedAt: base.progress?.checklistDismissedAt ?? null,
    createdAt: base.progress?.createdAt ?? now,
    updatedAt: now,
  };

  return buildOnboardingSnapshot({
    counts: base.counts,
    progress,
    legacyTutorialCompletedAt: base.legacyTutorialCompletedAt,
  });
}
