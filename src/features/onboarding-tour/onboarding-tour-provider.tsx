"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  completeActivationOnboardingAction,
  dismissOnboardingChecklistAction,
  dismissOnboardingWelcomeAction,
  markFinanceStepViewedAction,
  markWorkflowStepViewedAction,
  restartGuidedOnboardingAction,
  setGuidedStepAction,
  skipGuidedOnboardingAction,
} from "@/features/onboarding-tour/actions";
import { trackOnboardingEvent } from "@/features/onboarding-tour/analytics";
import {
  readLocalOnboardingFlags,
  writeLocalOnboardingFlags,
} from "@/features/onboarding-tour/local-progress";
import {
  buildOnboardingSnapshot,
  getGuidedStep,
  getGuidedStepIndex,
  isLastGuidedStep,
  ONBOARDING_GUIDED_STEP_COUNT,
  resolveInitialGuidedStepIndex,
  type OnboardingGuidedStep,
} from "@/features/onboarding-tour/steps";
import type {
  OnboardingChecklistStepId,
  OnboardingProgressRow,
  OnboardingSnapshot,
} from "@/features/onboarding-tour/types";

type SuccessToast = {
  id: string;
  title: string;
  description: string;
};

type OnboardingTourContextValue = {
  snapshot: OnboardingSnapshot;
  isOpen: boolean;
  stepIndex: number;
  step: OnboardingGuidedStep | null;
  stepCount: number;
  isLastStep: boolean;
  isPending: boolean;
  showWelcome: boolean;
  showSkipConfirm: boolean;
  showCompletion: boolean;
  successToast: SuccessToast | null;
  startTour: () => void;
  startConfiguration: () => void;
  exploreAlone: () => void;
  goNext: () => void;
  goPrev: () => void;
  skipTour: () => void;
  requestSkip: () => void;
  cancelSkip: () => void;
  confirmSkip: () => void;
  finishTour: () => void;
  dismissChecklist: () => void;
  dismissCompletion: (destination?: "dashboard" | "agenda") => void;
  markWorkflowViewed: () => void;
  markFinanceViewed: () => void;
  dismissSuccessToast: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

const STEP_SUCCESS: Partial<
  Record<
    OnboardingChecklistStepId,
    { title: string; description: string; event: Parameters<typeof trackOnboardingEvent>[0] }
  >
> = {
  service: {
    title: "Primeiro serviço cadastrado 🎉",
    description: "Agora o PetGestor já sabe o que você oferece aos seus clientes.",
    event: "service_created",
  },
  employee: {
    title: "Funcionário adicionado ✅",
    description: "Agora você poderá vincular esse profissional aos agendamentos.",
    event: "employee_created",
  },
  customer_pet: {
    title: "Primeiro cliente cadastrado 🐾",
    description: "Tutor e pet prontos para agendar.",
    event: "customer_created",
  },
  appointment: {
    title: "Primeiro agendamento criado 🎉",
    description: "A partir daqui você consegue acompanhar toda a operação pela agenda.",
    event: "first_appointment_created",
  },
  workflow: {
    title: "Fluxo de atendimento apresentado",
    description: "Use os status para acompanhar cada pet no dia a dia.",
    event: "workflow_viewed",
  },
};

function mergeLocalIntoSnapshot(
  base: OnboardingSnapshot,
  companyId: string,
  userId: string,
): OnboardingSnapshot {
  const local = readLocalOnboardingFlags(companyId, userId);
  if (Object.keys(local).length === 0) {
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
    guidedSkippedAt:
      local.guidedSkipped === false
        ? null
        : (base.progress?.guidedSkippedAt ?? (local.guidedSkipped ? now : null)),
    guidedActive: local.guidedActive ?? base.progress?.guidedActive ?? false,
    lastGuidedStep: local.lastGuidedStep ?? base.progress?.lastGuidedStep ?? null,
    workflowStepViewedAt:
      base.progress?.workflowStepViewedAt ?? (local.workflowViewed ? now : null),
    financeStepViewedAt:
      base.progress?.financeStepViewedAt ?? (local.financeViewed ? now : null),
    onboardingCompletedAt:
      base.progress?.onboardingCompletedAt ?? (local.completed ? now : null),
    checklistDismissedAt:
      local.checklistDismissed === false
        ? null
        : (base.progress?.checklistDismissedAt ??
          (local.checklistDismissed ? now : null)),
    createdAt: base.progress?.createdAt ?? now,
    updatedAt: now,
  };

  return buildOnboardingSnapshot({
    counts: base.counts,
    progress,
    legacyTutorialCompletedAt: base.legacyTutorialCompletedAt,
  });
}

type OnboardingTourProviderProps = {
  initialSnapshot: OnboardingSnapshot;
  companyId: string;
  userId: string;
  children: ReactNode;
};

export function OnboardingTourProvider({
  initialSnapshot,
  companyId,
  userId,
  children,
}: OnboardingTourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [localRevision, setLocalRevision] = useState(0);
  const bumpLocal = useCallback(() => {
    setLocalRevision((value) => value + 1);
  }, []);

  const snapshot = useMemo(
    () => mergeLocalIntoSnapshot(initialSnapshot, companyId, userId),
    // localRevision força re-leitura do localStorage após writes locais
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [companyId, initialSnapshot, localRevision, userId],
  );

  const [stepIndex, setStepIndex] = useState(() =>
    resolveInitialGuidedStepIndex(snapshot.counts, snapshot.progress),
  );
  const [guidedOpen, setGuidedOpen] = useState(
    () => snapshot.guidedActive && !snapshot.showWelcome,
  );
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionHandled, setCompletionHandled] = useState(() => snapshot.isFullyComplete);
  const [successToast, setSuccessToast] = useState<SuccessToast | null>(null);
  const [isPending, startTransition] = useTransition();
  const prevCompletedRef = useRef(
    new Set(snapshot.checklist.filter((item) => item.completed).map((item) => item.id)),
  );

  const showWelcome = snapshot.showWelcome && !welcomeDismissed;

  // Toasts / conclusão: agenda updates assíncronos (evita setState síncrono no effect).
  useEffect(() => {
    const prev = prevCompletedRef.current;
    const newlyCompleted = snapshot.checklist.filter(
      (item) => item.completed && !prev.has(item.id),
    );
    prevCompletedRef.current = new Set(
      snapshot.checklist.filter((item) => item.completed).map((item) => item.id),
    );

    const timer = window.setTimeout(() => {
      for (const item of newlyCompleted) {
        const meta = STEP_SUCCESS[item.id];
        if (meta) {
          setSuccessToast({
            id: `${item.id}-${Date.now()}`,
            title: meta.title,
            description: meta.description,
          });
          trackOnboardingEvent(meta.event);
        }
      }

      if (snapshot.showCompletionModal && !completionHandled && !snapshot.isFullyComplete) {
        setShowCompletion(true);
      }

      if (snapshot.guidedActive && !snapshot.showWelcome) {
        setGuidedOpen(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [completionHandled, snapshot]);

  const persistStep = useCallback(
    (stepId: string) => {
      writeLocalOnboardingFlags(companyId, userId, {
        lastGuidedStep: stepId,
        guidedActive: true,
      });
      bumpLocal();
      startTransition(async () => {
        await setGuidedStepAction(stepId);
      });
    },
    [bumpLocal, companyId, userId],
  );

  const navigateForStep = useCallback(
    (index: number) => {
      const step = getGuidedStep(index);
      if (step?.href && pathname !== step.href && !pathname.startsWith(`${step.href}/`)) {
        router.push(step.href);
      }
    },
    [pathname, router],
  );

  const startConfiguration = useCallback(() => {
    setWelcomeDismissed(true);
    setGuidedOpen(true);
    writeLocalOnboardingFlags(companyId, userId, {
      welcomeSeen: true,
      guidedActive: true,
      lastGuidedStep: "service",
    });
    bumpLocal();
    const nextIndex = resolveInitialGuidedStepIndex(snapshot.counts, {
      ...(snapshot.progress ?? {
        id: "",
        companyId,
        userId,
        onboardingStartedAt: null,
        welcomeSeenAt: null,
        guidedStartedAt: null,
        guidedSkippedAt: null,
        guidedActive: true,
        lastGuidedStep: "service",
        workflowStepViewedAt: null,
        financeStepViewedAt: null,
        onboardingCompletedAt: null,
        checklistDismissedAt: null,
        createdAt: "",
        updatedAt: "",
      }),
      guidedActive: true,
      lastGuidedStep: "service",
    });
    setStepIndex(nextIndex);
    trackOnboardingEvent("onboarding_started");
    startTransition(async () => {
      await dismissOnboardingWelcomeAction("start");
      navigateForStep(nextIndex);
      router.refresh();
    });
  }, [
    bumpLocal,
    companyId,
    navigateForStep,
    router,
    snapshot.counts,
    snapshot.progress,
    userId,
  ]);

  const exploreAlone = useCallback(() => {
    setWelcomeDismissed(true);
    setGuidedOpen(false);
    writeLocalOnboardingFlags(companyId, userId, {
      welcomeSeen: true,
      guidedActive: false,
    });
    bumpLocal();
    startTransition(async () => {
      await dismissOnboardingWelcomeAction("explore");
      router.refresh();
    });
  }, [bumpLocal, companyId, router, userId]);

  const startTour = useCallback(() => {
    setWelcomeDismissed(true);
    setGuidedOpen(true);
    setStepIndex(getGuidedStepIndex("service"));
    setCompletionHandled(false);
    writeLocalOnboardingFlags(companyId, userId, {
      welcomeSeen: true,
      guidedActive: true,
      guidedSkipped: false,
      lastGuidedStep: "service",
      checklistDismissed: false,
    });
    bumpLocal();
    startTransition(async () => {
      await restartGuidedOnboardingAction();
      navigateForStep(getGuidedStepIndex("service"));
      router.refresh();
    });
  }, [bumpLocal, companyId, navigateForStep, router, userId]);

  const goNext = useCallback(() => {
    const current = getGuidedStep(stepIndex);

    if (current?.id === "workflow") {
      writeLocalOnboardingFlags(companyId, userId, { workflowViewed: true });
      bumpLocal();
      startTransition(async () => {
        await markWorkflowStepViewedAction();
        router.refresh();
      });
    }
    if (current?.id === "finance") {
      writeLocalOnboardingFlags(companyId, userId, { financeViewed: true });
      bumpLocal();
      startTransition(async () => {
        await markFinanceStepViewedAction();
        trackOnboardingEvent("finance_viewed");
        router.refresh();
      });
    }

    if (isLastGuidedStep(stepIndex)) {
      setGuidedOpen(false);
      if (snapshot.completedCount >= snapshot.totalCount) {
        setShowCompletion(true);
      }
      return;
    }

    const next = Math.min(stepIndex + 1, ONBOARDING_GUIDED_STEP_COUNT - 1);
    setStepIndex(next);
    const nextStep = getGuidedStep(next);
    if (nextStep) {
      persistStep(nextStep.id);
      navigateForStep(next);
    }
  }, [
    bumpLocal,
    companyId,
    navigateForStep,
    persistStep,
    router,
    snapshot.completedCount,
    snapshot.totalCount,
    stepIndex,
    userId,
  ]);

  const goPrev = useCallback(() => {
    const prev = Math.max(stepIndex - 1, 0);
    setStepIndex(prev);
    const prevStep = getGuidedStep(prev);
    if (prevStep) {
      persistStep(prevStep.id);
      navigateForStep(prev);
    }
  }, [navigateForStep, persistStep, stepIndex]);

  const requestSkip = useCallback(() => {
    setShowSkipConfirm(true);
  }, []);

  const cancelSkip = useCallback(() => {
    setShowSkipConfirm(false);
  }, []);

  const confirmSkip = useCallback(() => {
    setShowSkipConfirm(false);
    setGuidedOpen(false);
    trackOnboardingEvent("onboarding_skipped");
    writeLocalOnboardingFlags(companyId, userId, {
      welcomeSeen: true,
      guidedSkipped: true,
      guidedActive: false,
    });
    bumpLocal();
    startTransition(async () => {
      await skipGuidedOnboardingAction();
      router.refresh();
    });
  }, [bumpLocal, companyId, router, userId]);

  const skipTour = useCallback(() => {
    requestSkip();
  }, [requestSkip]);

  const finishTour = useCallback(() => {
    setGuidedOpen(false);
    if (snapshot.completedCount >= snapshot.totalCount) {
      setShowCompletion(true);
    }
  }, [snapshot.completedCount, snapshot.totalCount]);

  const dismissCompletion = useCallback(
    (destination: "dashboard" | "agenda" = "dashboard") => {
      setShowCompletion(false);
      setCompletionHandled(true);
      trackOnboardingEvent("onboarding_completed");
      writeLocalOnboardingFlags(companyId, userId, {
        completed: true,
        welcomeSeen: true,
        guidedActive: false,
        workflowViewed: true,
        financeViewed: true,
      });
      bumpLocal();
      startTransition(async () => {
        await completeActivationOnboardingAction();
        router.push(destination === "agenda" ? "/dashboard/agenda" : "/dashboard");
        router.refresh();
      });
    },
    [bumpLocal, companyId, router, userId],
  );

  const dismissChecklist = useCallback(() => {
    writeLocalOnboardingFlags(companyId, userId, {
      checklistDismissed: true,
      completed: true,
    });
    bumpLocal();
    startTransition(async () => {
      await dismissOnboardingChecklistAction();
      router.refresh();
    });
  }, [bumpLocal, companyId, router, userId]);

  const markWorkflowViewed = useCallback(() => {
    writeLocalOnboardingFlags(companyId, userId, { workflowViewed: true });
    bumpLocal();
    startTransition(async () => {
      await markWorkflowStepViewedAction();
      trackOnboardingEvent("workflow_viewed");
      router.refresh();
    });
  }, [bumpLocal, companyId, router, userId]);

  const markFinanceViewed = useCallback(() => {
    writeLocalOnboardingFlags(companyId, userId, { financeViewed: true });
    bumpLocal();
    startTransition(async () => {
      await markFinanceStepViewedAction();
      trackOnboardingEvent("finance_viewed");
      router.refresh();
    });
  }, [bumpLocal, companyId, router, userId]);

  const dismissSuccessToast = useCallback(() => {
    setSuccessToast(null);
  }, []);

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      snapshot,
      isOpen: guidedOpen && !showWelcome,
      stepIndex,
      step: getGuidedStep(stepIndex),
      stepCount: ONBOARDING_GUIDED_STEP_COUNT,
      isLastStep: isLastGuidedStep(stepIndex),
      isPending,
      showWelcome,
      showSkipConfirm,
      showCompletion,
      successToast,
      startTour,
      startConfiguration,
      exploreAlone,
      goNext,
      goPrev,
      skipTour,
      requestSkip,
      cancelSkip,
      confirmSkip,
      finishTour,
      dismissChecklist,
      dismissCompletion,
      markWorkflowViewed,
      markFinanceViewed,
      dismissSuccessToast,
    }),
    [
      cancelSkip,
      confirmSkip,
      dismissChecklist,
      dismissCompletion,
      dismissSuccessToast,
      exploreAlone,
      finishTour,
      goNext,
      goPrev,
      guidedOpen,
      isPending,
      markFinanceViewed,
      markWorkflowViewed,
      requestSkip,
      showCompletion,
      showSkipConfirm,
      showWelcome,
      skipTour,
      snapshot,
      startConfiguration,
      startTour,
      stepIndex,
      successToast,
    ],
  );

  return (
    <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const context = useContext(OnboardingTourContext);

  if (!context) {
    throw new Error("useOnboardingTour deve ser usado dentro de OnboardingTourProvider.");
  }

  return context;
}

export function useOptionalOnboardingTour(): OnboardingTourContextValue | null {
  return useContext(OnboardingTourContext);
}
