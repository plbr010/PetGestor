export type OnboardingChecklistStepId =
  | "service"
  | "employee"
  | "customer_pet"
  | "appointment"
  | "workflow";

export type OnboardingGuidedStepId =
  | "welcome"
  | "service"
  | "employee"
  | "customer"
  | "pet"
  | "appointment"
  | "workflow"
  | "finance"
  | "complete";

export type OnboardingTargetId =
  | "cta-new-service"
  | "cta-new-employee"
  | "cta-new-customer"
  | "cta-add-pet"
  | "cta-new-appointment"
  | "panel-workflow"
  | "panel-finance"
  | "nav-servicos"
  | "nav-funcionarios"
  | "nav-tutores"
  | "nav-agenda"
  | "nav-atendimentos"
  | "nav-financeiro";

export type OnboardingActivationCounts = {
  services: number;
  employees: number;
  customers: number;
  pets: number;
  appointments: number;
};

export type OnboardingProgressRow = {
  id: string;
  companyId: string;
  userId: string;
  onboardingStartedAt: string | null;
  welcomeSeenAt: string | null;
  guidedStartedAt: string | null;
  guidedSkippedAt: string | null;
  guidedActive: boolean;
  lastGuidedStep: string | null;
  workflowStepViewedAt: string | null;
  financeStepViewedAt: string | null;
  onboardingCompletedAt: string | null;
  checklistDismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingChecklistItem = {
  id: OnboardingChecklistStepId;
  title: string;
  href: string;
  completed: boolean;
  autoDetected: boolean;
};

export type OnboardingSnapshot = {
  counts: OnboardingActivationCounts;
  progress: OnboardingProgressRow | null;
  /** Legacy profile flag — used when progress table is missing. */
  legacyTutorialCompletedAt: string | null;
  checklist: OnboardingChecklistItem[];
  completedCount: number;
  totalCount: number;
  percent: number;
  isFullyComplete: boolean;
  showWelcome: boolean;
  showChecklist: boolean;
  showCompletionModal: boolean;
  guidedActive: boolean;
  workflowViewed: boolean;
  financeViewed: boolean;
};
