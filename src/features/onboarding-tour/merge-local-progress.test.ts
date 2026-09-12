import { afterEach, describe, expect, it } from "vitest";

import { mergeLocalIntoSnapshot } from "@/features/onboarding-tour/merge-local-progress";
import { writeLocalOnboardingFlags } from "@/features/onboarding-tour/local-progress";
import { buildOnboardingSnapshot } from "@/features/onboarding-tour/steps";
import type { OnboardingProgressRow } from "@/features/onboarding-tour/types";

const emptyCounts = {
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
    onboardingStartedAt: "2026-09-01T00:00:00.000Z",
    welcomeSeenAt: null,
    guidedStartedAt: null,
    guidedSkippedAt: null,
    guidedActive: false,
    lastGuidedStep: null,
    workflowStepViewedAt: null,
    financeStepViewedAt: null,
    onboardingCompletedAt: "2026-09-02T00:00:00.000Z",
    checklistDismissedAt: "2026-09-02T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeLocalIntoSnapshot", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("estado persistido concluído prevalece sobre localStorage antigo", () => {
    writeLocalOnboardingFlags("c1", "u1", {
      guidedActive: true,
      completed: false,
      checklistDismissed: false,
    });

    const base = buildOnboardingSnapshot({
      counts: { ...emptyCounts, services: 1, employees: 1, customers: 1, pets: 1, appointments: 1 },
      progress: progress(),
      legacyTutorialCompletedAt: null,
    });

    const merged = mergeLocalIntoSnapshot(base, "c1", "u1");
    expect(merged.isFullyComplete).toBe(true);
    expect(merged.guidedActive).toBe(false);
    expect(merged.progress?.onboardingCompletedAt).toBe("2026-09-02T00:00:00.000Z");
  });

  it("progresso local de outra empresa não vaza", () => {
    writeLocalOnboardingFlags("c2", "u1", { completed: true, guidedActive: false });

    const base = buildOnboardingSnapshot({
      counts: emptyCounts,
      progress: progress({
        companyId: "c1",
        onboardingCompletedAt: null,
        checklistDismissedAt: null,
      }),
      legacyTutorialCompletedAt: null,
    });

    const merged = mergeLocalIntoSnapshot(base, "c1", "u1");
    expect(merged.isFullyComplete).toBe(false);
  });
});
