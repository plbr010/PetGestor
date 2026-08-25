import type {
  OnboardingActivationCounts,
  OnboardingChecklistItem,
  OnboardingChecklistStepId,
  OnboardingGuidedStepId,
  OnboardingProgressRow,
  OnboardingSnapshot,
  OnboardingTargetId,
} from "@/features/onboarding-tour/types";

export type OnboardingGuidedStep = {
  id: OnboardingGuidedStepId;
  title: string;
  description: string;
  href: string | null;
  targetId: OnboardingTargetId | null;
  /** Checklist step this guided tip helps complete (if any). */
  checklistId: OnboardingChecklistStepId | null;
  hints?: string[];
};

export const ONBOARDING_CHECKLIST_TOTAL = 5;

export const ONBOARDING_GUIDED_STEPS: OnboardingGuidedStep[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao PetGestor 👋",
    description:
      "Vamos preparar seu pet shop para começar a usar o sistema. Em poucos minutos você terá serviços, clientes e sua agenda pronta.",
    href: "/dashboard",
    targetId: null,
    checklistId: null,
  },
  {
    id: "service",
    title: "Cadastre seu primeiro serviço",
    description: "Comece cadastrando os serviços que seu pet shop oferece.",
    href: "/dashboard/servicos",
    targetId: "cta-new-service",
    checklistId: "service",
    hints: ["Banho", "Tosa", "Banho + Tosa", "Hidratação"],
  },
  {
    id: "employee",
    title: "Adicione um funcionário",
    description:
      "Agora adicione quem realiza os atendimentos. Você poderá configurar nome, serviços, jornada e horários.",
    href: "/dashboard/funcionarios",
    targetId: "cta-new-employee",
    checklistId: "employee",
  },
  {
    id: "customer",
    title: "Cadastre um cliente",
    description: "Cadastre seu primeiro cliente e depois adicione o pet dele.",
    href: "/dashboard/tutores",
    targetId: "cta-new-customer",
    checklistId: "customer_pet",
  },
  {
    id: "pet",
    title: "Adicione o pet",
    description: "Agora adicione o pet desse cliente para poder agendar.",
    href: "/dashboard/tutores",
    targetId: "cta-add-pet",
    checklistId: "customer_pet",
  },
  {
    id: "appointment",
    title: "Crie seu primeiro agendamento",
    description:
      "Vamos criar seu primeiro agendamento: cliente, pet, serviço, funcionário, data e horário.",
    href: "/dashboard/agenda",
    targetId: "cta-new-appointment",
    checklistId: "appointment",
  },
  {
    id: "workflow",
    title: "Conheça o fluxo de atendimento",
    description:
      "Acompanhe cada pet: Agendado → Check-in → Em atendimento → Pronto → Entregue.",
    href: "/dashboard/atendimentos",
    targetId: "panel-workflow",
    checklistId: "workflow",
  },
  {
    id: "finance",
    title: "Seu financeiro fica organizado",
    description:
      "Ao concluir os atendimentos, o PetGestor ajuda você a acompanhar receitas, pagamentos, despesas e valores pendentes.",
    href: "/dashboard/financeiro",
    targetId: "panel-finance",
    checklistId: null,
  },
  {
    id: "complete",
    title: "Tudo pronto! 🎉",
    description:
      "Seu PetGestor já está configurado para começar a organizar seu pet shop.",
    href: "/dashboard",
    targetId: null,
    checklistId: null,
  },
];

export const ONBOARDING_GUIDED_STEP_COUNT = ONBOARDING_GUIDED_STEPS.length;

const CHECKLIST_META: Array<{
  id: OnboardingChecklistStepId;
  title: string;
  href: string;
}> = [
  {
    id: "service",
    title: "Cadastre um serviço",
    href: "/dashboard/servicos",
  },
  {
    id: "employee",
    title: "Adicione um funcionário",
    href: "/dashboard/funcionarios",
  },
  {
    id: "customer_pet",
    title: "Cadastre um cliente e pet",
    href: "/dashboard/tutores",
  },
  {
    id: "appointment",
    title: "Crie seu primeiro agendamento",
    href: "/dashboard/agenda",
  },
  {
    id: "workflow",
    title: "Conheça o fluxo de atendimento",
    href: "/dashboard/atendimentos",
  },
];

export function isServiceStepComplete(counts: OnboardingActivationCounts): boolean {
  return counts.services >= 1;
}

export function isEmployeeStepComplete(counts: OnboardingActivationCounts): boolean {
  return counts.employees >= 1;
}

export function isCustomerPetStepComplete(counts: OnboardingActivationCounts): boolean {
  return counts.customers >= 1 && counts.pets >= 1;
}

export function isAppointmentStepComplete(counts: OnboardingActivationCounts): boolean {
  return counts.appointments >= 1;
}

export function isWorkflowStepComplete(
  counts: OnboardingActivationCounts,
  workflowViewed: boolean,
): boolean {
  return workflowViewed;
}

export function buildChecklistItems(
  counts: OnboardingActivationCounts,
  workflowViewed: boolean,
): OnboardingChecklistItem[] {
  return CHECKLIST_META.map((item) => {
    switch (item.id) {
      case "service":
        return {
          ...item,
          completed: isServiceStepComplete(counts),
          autoDetected: true,
        };
      case "employee":
        return {
          ...item,
          completed: isEmployeeStepComplete(counts),
          autoDetected: true,
        };
      case "customer_pet":
        return {
          ...item,
          completed: isCustomerPetStepComplete(counts),
          autoDetected: true,
        };
      case "appointment":
        return {
          ...item,
          completed: isAppointmentStepComplete(counts),
          autoDetected: true,
        };
      case "workflow":
        return {
          ...item,
          completed: isWorkflowStepComplete(counts, workflowViewed),
          autoDetected: false,
        };
      default: {
        const _exhaustive: never = item.id;
        return _exhaustive;
      }
    }
  });
}

export function getGuidedStep(index: number): OnboardingGuidedStep | null {
  if (index < 0 || index >= ONBOARDING_GUIDED_STEPS.length) {
    return null;
  }
  return ONBOARDING_GUIDED_STEPS[index] ?? null;
}

export function getGuidedStepIndex(stepId: string | null | undefined): number {
  if (!stepId) {
    return 0;
  }
  const index = ONBOARDING_GUIDED_STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

export function isLastGuidedStep(index: number): boolean {
  return index >= ONBOARDING_GUIDED_STEPS.length - 1;
}

/** @deprecated Prefer shouldShowWelcomeModal — kept for testes do tour legado. */
export function shouldAutoStartOnboardingTour(
  completedAt: string | null | undefined,
): boolean {
  return completedAt == null;
}

export function shouldShowWelcomeModal(snapshot: Pick<
  OnboardingSnapshot,
  "showWelcome" | "isFullyComplete"
>): boolean {
  return snapshot.showWelcome && !snapshot.isFullyComplete;
}

export function buildOnboardingSnapshot(input: {
  counts: OnboardingActivationCounts;
  progress: OnboardingProgressRow | null;
  legacyTutorialCompletedAt: string | null;
}): OnboardingSnapshot {
  const { counts, progress, legacyTutorialCompletedAt } = input;

  const legacyComplete = legacyTutorialCompletedAt != null;
  const workflowViewed = progress?.workflowStepViewedAt != null;
  const financeViewed = progress?.financeStepViewedAt != null;
  const checklist = buildChecklistItems(counts, workflowViewed);
  const completedCount = checklist.filter((item) => item.completed).length;
  const totalCount = checklist.length;
  const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const dataComplete = completedCount >= totalCount;

  const progressCompleted = progress?.onboardingCompletedAt != null;
  const isFullyComplete = progressCompleted || (progress == null && legacyComplete);

  const welcomeSeen = progress?.welcomeSeenAt != null || legacyComplete;
  const checklistDismissed = progress?.checklistDismissedAt != null || legacyComplete;

  const showWelcome = !welcomeSeen && !isFullyComplete;
  // Checklist after welcome (including “explorar sozinho”). Hidden when dismissed or fully complete.
  const showChecklist = !isFullyComplete && !checklistDismissed && welcomeSeen;
  // Completion modal when all checklist items done and not yet marked complete.
  const showCompletionModal =
    dataComplete && !progressCompleted && !legacyComplete && welcomeSeen;

  // Guided stays active only when explicitly started and not skipped/completed.
  const guidedActive =
    !isFullyComplete &&
    Boolean(progress?.guidedActive) &&
    progress?.guidedSkippedAt == null;

  return {
    counts,
    progress,
    legacyTutorialCompletedAt,
    checklist,
    completedCount,
    totalCount,
    percent,
    isFullyComplete,
    showWelcome,
    showChecklist,
    showCompletionModal,
    guidedActive,
    workflowViewed,
    financeViewed,
  };
}

export function resolveInitialGuidedStepIndex(
  counts: OnboardingActivationCounts,
  progress: OnboardingProgressRow | null,
): number {
  if (progress?.lastGuidedStep) {
    return getGuidedStepIndex(progress.lastGuidedStep);
  }

  if (!isServiceStepComplete(counts)) {
    return getGuidedStepIndex("service");
  }
  if (!isEmployeeStepComplete(counts)) {
    return getGuidedStepIndex("employee");
  }
  if (counts.customers < 1) {
    return getGuidedStepIndex("customer");
  }
  if (counts.pets < 1) {
    return getGuidedStepIndex("pet");
  }
  if (!isAppointmentStepComplete(counts)) {
    return getGuidedStepIndex("appointment");
  }
  if (progress?.workflowStepViewedAt == null) {
    return getGuidedStepIndex("workflow");
  }
  if (progress?.financeStepViewedAt == null) {
    return getGuidedStepIndex("finance");
  }
  return getGuidedStepIndex("complete");
}

/** Aliases usados pelos testes e pelo overlay legado. */
export const ONBOARDING_TOUR_STEPS = ONBOARDING_GUIDED_STEPS.map((step) => ({
  id: step.id,
  title: step.title,
  description: step.description,
  targetId: step.targetId,
}));

export const ONBOARDING_TOUR_STEP_COUNT = ONBOARDING_GUIDED_STEP_COUNT;

export function getOnboardingTourStep(index: number) {
  return getGuidedStep(index);
}

export function isLastOnboardingTourStep(index: number) {
  return isLastGuidedStep(index);
}

export type OnboardingTourStep = OnboardingGuidedStep;
export type OnboardingTourTargetId = OnboardingTargetId;
