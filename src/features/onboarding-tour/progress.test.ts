import { describe, expect, it } from "vitest";

import {
  buildChecklistItems,
  buildOnboardingSnapshot,
  getGuidedStep,
  isAppointmentStepComplete,
  isCustomerPetStepComplete,
  isEmployeeStepComplete,
  isLastGuidedStep,
  isServiceStepComplete,
  ONBOARDING_CHECKLIST_TOTAL,
  ONBOARDING_GUIDED_STEP_COUNT,
  ONBOARDING_TOUR_STEP_COUNT,
  resolveInitialGuidedStepIndex,
  shouldAutoStartOnboardingTour,
} from "@/features/onboarding-tour/steps";
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
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ...partial,
  };
}

describe("detecção automática de etapas", () => {
  it("usuário novo sem dados: nada concluído", () => {
    const items = buildChecklistItems(emptyCounts, false);
    expect(items.every((item) => !item.completed)).toBe(true);
    expect(items).toHaveLength(ONBOARDING_CHECKLIST_TOTAL);
  });

  it("detecta serviço existente", () => {
    expect(isServiceStepComplete({ ...emptyCounts, services: 1 })).toBe(true);
  });

  it("detecta funcionário existente", () => {
    expect(isEmployeeStepComplete({ ...emptyCounts, employees: 2 })).toBe(true);
  });

  it("exige tutor e pet juntos", () => {
    expect(isCustomerPetStepComplete({ ...emptyCounts, customers: 1 })).toBe(false);
    expect(isCustomerPetStepComplete({ ...emptyCounts, customers: 1, pets: 1 })).toBe(true);
  });

  it("detecta agendamento existente", () => {
    expect(isAppointmentStepComplete({ ...emptyCounts, appointments: 1 })).toBe(true);
  });
});

describe("snapshot de onboarding", () => {
  it("mostra welcome para usuário novo", () => {
    const snap = buildOnboardingSnapshot({
      counts: emptyCounts,
      progress: null,
      legacyTutorialCompletedAt: null,
    });
    expect(snap.showWelcome).toBe(true);
    expect(snap.showChecklist).toBe(false);
    expect(snap.isFullyComplete).toBe(false);
  });

  it("após explorar sozinho, mantém checklist sem tour guiado", () => {
    const snap = buildOnboardingSnapshot({
      counts: emptyCounts,
      progress: progress({ welcomeSeenAt: "2026-08-25T12:00:00.000Z", guidedActive: false }),
      legacyTutorialCompletedAt: null,
    });
    expect(snap.showWelcome).toBe(false);
    expect(snap.showChecklist).toBe(true);
    expect(snap.guidedActive).toBe(false);
  });

  it("pular tutorial desliga guia e mantém checklist", () => {
    const snap = buildOnboardingSnapshot({
      counts: { ...emptyCounts, services: 1 },
      progress: progress({
        welcomeSeenAt: "2026-08-25T12:00:00.000Z",
        guidedSkippedAt: "2026-08-25T12:05:00.000Z",
        guidedActive: false,
      }),
      legacyTutorialCompletedAt: null,
    });
    expect(snap.guidedActive).toBe(false);
    expect(snap.showChecklist).toBe(true);
    expect(snap.completedCount).toBe(1);
  });

  it("legado concluído não reabre onboarding", () => {
    const snap = buildOnboardingSnapshot({
      counts: emptyCounts,
      progress: null,
      legacyTutorialCompletedAt: "2026-08-14T12:00:00.000Z",
    });
    expect(snap.isFullyComplete).toBe(true);
    expect(snap.showWelcome).toBe(false);
    expect(snap.showChecklist).toBe(false);
  });

  it("conclui checklist e oferece modal de sucesso", () => {
    const snap = buildOnboardingSnapshot({
      counts: {
        services: 1,
        employees: 1,
        customers: 1,
        pets: 1,
        appointments: 1,
      },
      progress: progress({
        welcomeSeenAt: "2026-08-25T12:00:00.000Z",
        workflowStepViewedAt: "2026-08-25T12:10:00.000Z",
      }),
      legacyTutorialCompletedAt: null,
    });
    expect(snap.completedCount).toBe(5);
    expect(snap.showCompletionModal).toBe(true);
    expect(snap.isFullyComplete).toBe(false);
  });

  it("após completed_at, não mostra modal nem checklist", () => {
    const snap = buildOnboardingSnapshot({
      counts: {
        services: 1,
        employees: 1,
        customers: 1,
        pets: 1,
        appointments: 1,
      },
      progress: progress({
        welcomeSeenAt: "2026-08-25T12:00:00.000Z",
        workflowStepViewedAt: "2026-08-25T12:10:00.000Z",
        onboardingCompletedAt: "2026-08-25T12:20:00.000Z",
        checklistDismissedAt: "2026-08-25T12:20:00.000Z",
      }),
      legacyTutorialCompletedAt: "2026-08-25T12:20:00.000Z",
    });
    expect(snap.isFullyComplete).toBe(true);
    expect(snap.showCompletionModal).toBe(false);
    expect(snap.showChecklist).toBe(false);
  });

  it("continua do passo correto conforme dados", () => {
    expect(resolveInitialGuidedStepIndex(emptyCounts, null)).toBe(
      getGuidedStep(1)?.id === "service" ? 1 : 1,
    );
    expect(
      resolveInitialGuidedStepIndex({ ...emptyCounts, services: 1 }, null),
    ).toBeGreaterThan(1);
    expect(
      getGuidedStep(
        resolveInitialGuidedStepIndex(
          { ...emptyCounts, services: 1, employees: 1 },
          null,
        ),
      )?.id,
    ).toBe("customer");
  });
});

describe("tour guiado", () => {
  it("define etapas de ativação com finalização", () => {
    expect(ONBOARDING_GUIDED_STEP_COUNT).toBe(9);
    expect(ONBOARDING_TOUR_STEP_COUNT).toBe(9);
    expect(isLastGuidedStep(8)).toBe(true);
    expect(getGuidedStep(0)?.id).toBe("welcome");
    expect(getGuidedStep(8)?.id).toBe("complete");
  });

  it("shouldAutoStartOnboardingTour permanece compatível", () => {
    expect(shouldAutoStartOnboardingTour(null)).toBe(true);
    expect(shouldAutoStartOnboardingTour("2026-08-14T12:00:00.000Z")).toBe(false);
  });
});
