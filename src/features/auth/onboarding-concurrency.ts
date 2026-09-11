export type CompleteOnboardingOutcome =
  | { status: "created"; companyId: string }
  | { status: "existing_active"; companyId: string }
  | { status: "revoked" };

type FakeMembership = {
  userId: string;
  companyId: string;
  accessRevokedAt: string | null;
  updatedAt: number;
};

type FakeCompany = {
  id: string;
  createdBy: string;
  trialCreated: boolean;
};

/**
 * Modelo em memória do RPC complete_onboarding (lock + regras BLOCO 8).
 * Usado para provar concorrência/idempotência sem Postgres ao vivo.
 */
export function createOnboardingStore() {
  const memberships: FakeMembership[] = [];
  const companies: FakeCompany[] = [];
  const locks = new Map<string, Promise<void>>();
  let companySeq = 0;

  async function withUserLock<T>(userId: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = locks.get(userId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(userId, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function complete(userId: string): Promise<CompleteOnboardingOutcome> {
    return withUserLock(userId, () => {
      const active = memberships
        .filter((row) => row.userId === userId && row.accessRevokedAt == null)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (active[0]) {
        return { status: "existing_active", companyId: active[0].companyId };
      }

      const revoked = memberships.some(
        (row) => row.userId === userId && row.accessRevokedAt != null,
      );
      if (revoked) {
        return { status: "revoked" };
      }

      companySeq += 1;
      const companyId = `company-${companySeq}`;
      companies.push({ id: companyId, createdBy: userId, trialCreated: true });
      memberships.push({
        userId,
        companyId,
        accessRevokedAt: null,
        updatedAt: Date.now(),
      });
      return { status: "created", companyId };
    });
  }

  return {
    complete,
    seedMembership(row: FakeMembership) {
      memberships.push(row);
    },
    companies,
    memberships,
  };
}
