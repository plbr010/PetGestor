import { describe, expect, it } from "vitest";

import { mergeLocalIntoSnapshot } from "@/features/onboarding-tour/merge-local-snapshot";
import { buildOnboardingSnapshot } from "@/features/onboarding-tour/steps";
import type { OnboardingProgressRow } from "@/features/onboarding-tour/types";

const counts = {
  services: 0,
  employees: 0,
  customers: 0,
  pets: 0,
  appointments: 0,
};

function progress(partial: Partial<OnboardingProgressRow> = {}): OnboardingProgressRow {
  return {
    id: "1",
    companyId: "c1",
    userId: "u1",
    onboardingStartedAt: null,
    welcomeSeenAt: null,
    guidedStartedAt: null,
    guidedSkippedAt: null,
    guidedActive: false,
    lastGuidedStep: null,
    workflowStepViewedAt: null,
    financeStepViewedAt: null,
    onboardingCompletedAt: null,
    checklistDismissedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeLocalIntoSnapshot", () => {
  it("servidor concluído prevalece sobre localStorage stale", () => {
    const base = buildOnboardingSnapshot({
      counts: { ...counts, services: 5, employees: 5, customers: 5, pets: 5, appointments: 5 },
      progress: progress({
        onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
        checklistDismissedAt: "2026-09-01T00:00:00.000Z",
      }),
      legacyTutorialCompletedAt: null,
    });

    const merged = mergeLocalIntoSnapshot(base, "c1", "u1", {
      completed: false,
      guidedActive: true,
      checklistDismissed: false,
    });

    expect(merged.isFullyComplete).toBe(true);
    expect(merged.guidedActive).toBe(false);
  });

  it("localStorage não marca tutorial como concluído se o servidor não concluiu", () => {
    const base = buildOnboardingSnapshot({
      counts,
      progress: progress(),
      legacyTutorialCompletedAt: null,
    });

    const merged = mergeLocalIntoSnapshot(base, "c1", "u1", {
      completed: true,
      checklistDismissed: true,
      guidedActive: true,
    });

    expect(merged.isFullyComplete).toBe(false);
    expect(merged.progress?.onboardingCompletedAt).toBeNull();
    expect(merged.progress?.checklistDismissedAt).toBeNull();
    expect(merged.guidedActive).toBe(false);
  });

  it("progresso é por company_id: flags de outra empresa não se misturam", () => {
    const base = buildOnboardingSnapshot({
      counts,
      progress: progress({ companyId: "c2", lastGuidedStep: "service" }),
      legacyTutorialCompletedAt: null,
    });

    const merged = mergeLocalIntoSnapshot(base, "c2", "u1", { lastGuidedStep: "finance" });
    expect(merged.progress?.companyId).toBe("c2");
    expect(merged.progress?.lastGuidedStep).toBe("service");
  });
});
