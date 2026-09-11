import { describe, expect, it } from "vitest";

import { createOnboardingStore } from "@/features/auth/onboarding-concurrency";

describe("complete_onboarding concurrency / idempotency", () => {
  it("onboarding normal cria 1 empresa, 1 membership e 1 trial", async () => {
    const store = createOnboardingStore();
    const result = await store.complete("user-1");

    expect(result).toEqual({ status: "created", companyId: "company-1" });
    expect(store.companies).toHaveLength(1);
    expect(store.memberships).toHaveLength(1);
    expect(store.companies[0]?.trialCreated).toBe(true);
  });

  it("duplo clique retorna a mesma company_id", async () => {
    const store = createOnboardingStore();
    const first = await store.complete("user-1");
    const second = await store.complete("user-1");

    expect(first.status).toBe("created");
    expect(second).toEqual({
      status: "existing_active",
      companyId: first.status === "created" ? first.companyId : "",
    });
    expect(store.companies).toHaveLength(1);
  });

  it("retry após timeout retorna a mesma company", async () => {
    const store = createOnboardingStore();
    const first = await store.complete("user-1");
    const retry = await store.complete("user-1");

    expect(retry.status).toBe("existing_active");
    expect(retry.status !== "revoked" && retry.companyId).toBe(
      first.status !== "revoked" ? first.companyId : "",
    );
    expect(store.companies).toHaveLength(1);
  });

  it("duas chamadas simultâneas retornam a mesma company", async () => {
    const store = createOnboardingStore();
    const [a, b] = await Promise.all([store.complete("user-1"), store.complete("user-1")]);

    expect(a.status !== "revoked" && b.status !== "revoked").toBe(true);
    if (a.status !== "revoked" && b.status !== "revoked") {
      expect(a.companyId).toBe(b.companyId);
    }
    expect(store.companies).toHaveLength(1);
    expect(store.memberships.filter((row) => row.userId === "user-1")).toHaveLength(1);
  });

  it("usuário já onboarded retorna estado existente", async () => {
    const store = createOnboardingStore();
    store.seedMembership({
      userId: "user-1",
      companyId: "company-existing",
      accessRevokedAt: null,
      updatedAt: 2,
    });

    await expect(store.complete("user-1")).resolves.toEqual({
      status: "existing_active",
      companyId: "company-existing",
    });
    expect(store.companies).toHaveLength(0);
  });

  it("membership revogada não ganha acesso nem cria empresa", async () => {
    const store = createOnboardingStore();
    store.seedMembership({
      userId: "user-1",
      companyId: "old-company",
      accessRevokedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: 1,
    });

    await expect(store.complete("user-1")).resolves.toEqual({ status: "revoked" });
    expect(store.companies).toHaveLength(0);
  });

  it("duas empresas ativas não escolhem a membership mais antiga", async () => {
    const store = createOnboardingStore();
    store.seedMembership({
      userId: "user-1",
      companyId: "oldest",
      accessRevokedAt: null,
      updatedAt: 1,
    });
    store.seedMembership({
      userId: "user-1",
      companyId: "newest",
      accessRevokedAt: null,
      updatedAt: 9,
    });

    await expect(store.complete("user-1")).resolves.toEqual({
      status: "existing_active",
      companyId: "newest",
    });
  });
});
