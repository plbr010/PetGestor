const STORAGE_PREFIX = "petgestor:onboarding:";

export type LocalOnboardingFlags = {
  welcomeSeen?: boolean;
  guidedSkipped?: boolean;
  guidedActive?: boolean;
  lastGuidedStep?: string;
  workflowViewed?: boolean;
  financeViewed?: boolean;
  completed?: boolean;
  checklistDismissed?: boolean;
};

function storageKey(companyId: string, userId: string): string {
  return `${STORAGE_PREFIX}${companyId}:${userId}`;
}

export function readLocalOnboardingFlags(
  companyId: string,
  userId: string,
): LocalOnboardingFlags {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(storageKey(companyId, userId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as LocalOnboardingFlags;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLocalOnboardingFlags(
  companyId: string,
  userId: string,
  patch: LocalOnboardingFlags,
): LocalOnboardingFlags {
  if (typeof window === "undefined") {
    return patch;
  }
  try {
    const next = { ...readLocalOnboardingFlags(companyId, userId), ...patch };
    window.localStorage.setItem(storageKey(companyId, userId), JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}
