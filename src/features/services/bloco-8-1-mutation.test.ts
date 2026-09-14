import { describe, expect, it } from "vitest";

import {
  applySequentialUpdates,
  createEmptyServiceMutationStore,
  createServiceAtomic,
  parseRecipesJson,
  updateServiceAtomic,
  type ServiceMutationActor,
  type ServiceMutationInput,
  type ServiceMutationProduct,
} from "@/features/services/mutation-engine";
import { serviceMutationFingerprint } from "@/features/services/mutation-policy";
import { getProfilePermissions, hasPermission } from "@/lib/auth/permissions";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_A1 = "11111111-1111-4111-8111-111111111111";
const PRODUCT_A2 = "22222222-2222-4222-8222-222222222222";
const PRODUCT_B1 = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ARCHIVED = "44444444-4444-4444-8444-444444444444";
const KEY_1 = "idem-key-create-0001";
const KEY_2 = "idem-key-update-0002";
const KEY_3 = "idem-key-update-0003";

const owner: ServiceMutationActor = {
  companyId: COMPANY_A,
  hasServicesManage: true,
  accessRevokedAt: null,
};

const products: ServiceMutationProduct[] = [
  { id: PRODUCT_A1, companyId: COMPANY_A, archivedAt: null },
  { id: PRODUCT_A2, companyId: COMPANY_A, archivedAt: null },
  { id: PRODUCT_ARCHIVED, companyId: COMPANY_A, archivedAt: "2026-01-01T00:00:00.000Z" },
  { id: PRODUCT_B1, companyId: COMPANY_B, archivedAt: null },
];

const sizePrices = [
  { size: "small" as const, priceCents: 4500, durationMinutes: 30 },
  { size: "medium" as const, priceCents: 6000, durationMinutes: 45 },
  { size: "large" as const, priceCents: 8000, durationMinutes: 60 },
  { size: "giant" as const, priceCents: 11000, durationMinutes: 90 },
];

function fixedInput(overrides: Partial<ServiceMutationInput> = {}): ServiceMutationInput {
  return {
    companyId: COMPANY_A,
    name: "Banho",
    description: null,
    pricingMode: "fixed",
    priceCents: 8990,
    durationMinutes: 60,
    active: true,
    sizePrices: null,
    recipes: [],
    idempotencyKey: KEY_1,
    ...overrides,
  };
}

describe("BLOCO 8.1 — contrato transacional serviço/preços/ficha", () => {
  it("1) create válido persiste core, preço e ficha juntos", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({
        recipes: [{ productId: PRODUCT_A1, quantity: 20 }],
      }),
    );

    expect(result.ok).toBe(true);
    expect(store.services).toHaveLength(1);
    expect(store.services[0]?.priceCents).toBe(8990);
    expect(store.services[0]?.recipes).toEqual([{ productId: PRODUCT_A1, quantity: 20 }]);
  });

  it("2) update válido substitui core, preços e ficha", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_A1, quantity: 10 }] }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        serviceId: created.serviceId,
        name: "Banho premium",
        priceCents: 9900,
        recipes: [{ productId: PRODUCT_A2, quantity: 5 }],
        idempotencyKey: KEY_2,
      }),
    );

    expect(updated.ok).toBe(true);
    expect(store.services).toHaveLength(1);
    expect(store.services[0]?.name).toBe("Banho premium");
    expect(store.services[0]?.priceCents).toBe(9900);
    expect(store.services[0]?.recipes).toEqual([{ productId: PRODUCT_A2, quantity: 5 }]);
  });

  it("3) serviço fixed é preservado", () => {
    const store = createEmptyServiceMutationStore(products);
    createServiceAtomic(store, owner, fixedInput());
    expect(store.services[0]?.pricingMode).toBe("fixed");
    expect(store.services[0]?.sizePrices).toEqual([]);
  });

  it("4) serviço by_size com quatro portes é preservado", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({
        pricingMode: "by_size",
        priceCents: null,
        durationMinutes: 30,
        sizePrices,
        idempotencyKey: "idem-key-bysize-0004",
      }),
    );
    expect(result.ok).toBe(true);
    expect(store.services[0]?.pricingMode).toBe("by_size");
    expect(store.services[0]?.sizePrices).toHaveLength(4);
  });

  it("5) ficha vazia é permitida e no update limpa a anterior", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_A1, quantity: 2 }] }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        serviceId: created.serviceId,
        recipes: [],
        idempotencyKey: KEY_2,
      }),
    );
    expect(updated.ok).toBe(true);
    expect(store.services[0]?.recipes).toEqual([]);
  });

  it("6) múltiplos produtos na ficha", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({
        recipes: [
          { productId: PRODUCT_A2, quantity: 3 },
          { productId: PRODUCT_A1, quantity: 1 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(store.services[0]?.recipes).toHaveLength(2);
  });

  it("7) quantity = 0 é rejeitada", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_A1, quantity: 0 }] }),
    );
    expect(result).toEqual({ ok: false, error: "invalid_recipe_quantity" });
    expect(store.services).toHaveLength(0);
  });

  it("8) quantity negativa é rejeitada", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_A1, quantity: -1 }] }),
    );
    expect(result.ok).toBe(false);
    expect(store.services).toHaveLength(0);
  });

  it("9) product inexistente é rejeitado", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({
        recipes: [{ productId: "99999999-9999-4999-8999-999999999999", quantity: 1 }],
      }),
    );
    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(store.services).toHaveLength(0);
  });

  it("10) product cross-tenant é rejeitado", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_B1, quantity: 1 }] }),
    );
    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(store.services).toHaveLength(0);
  });

  it("11) product arquivado é indisponível (regra real do schema)", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({ recipes: [{ productId: PRODUCT_ARCHIVED, quantity: 1 }] }),
    );
    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("12) pricing inválido é rejeitado", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({ priceCents: -10 }),
    );
    expect(result).toEqual({ ok: false, error: "invalid_price_cents" });
    expect(store.services).toHaveLength(0);
  });

  it("13) falha na ficha no CREATE → rollback total", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      owner,
      fixedInput({
        name: "Serviço válido",
        priceCents: 5000,
        recipes: [{ productId: PRODUCT_B1, quantity: 1 }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(store.services).toHaveLength(0);
    expect(store.attempts).toHaveLength(0);
  });

  it("14) falha na ficha no UPDATE → estado anterior integral", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(
      store,
      owner,
      fixedInput({
        name: "Original",
        priceCents: 1000,
        recipes: [{ productId: PRODUCT_A1, quantity: 2 }],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = structuredClone(store.services[0]);

    const updated = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        serviceId: created.serviceId,
        name: "Alterado",
        priceCents: 2000,
        recipes: [{ productId: PRODUCT_B1, quantity: 9 }],
        idempotencyKey: KEY_2,
      }),
    );

    expect(updated.ok).toBe(false);
    expect(store.services[0]).toEqual(before);
  });

  it("15) staff sem permission é negado", () => {
    const store = createEmptyServiceMutationStore(products);
    expect(getProfilePermissions("finance")).not.toContain("services.manage");
    const staff: ServiceMutationActor = {
      companyId: COMPANY_A,
      hasServicesManage: hasPermission(
        {
          role: "staff",
          accessProfile: "finance",
          permissions: getProfilePermissions("finance"),
          accessRevokedAt: null,
          employeeId: "emp-1",
          ownScheduleOnly: false,
        },
        "services.manage",
      ),
      accessRevokedAt: null,
    };
    const result = createServiceAtomic(store, staff, fixedInput());
    expect(staff.hasServicesManage).toBe(false);
    expect(result).toEqual({ ok: false, error: "permission_denied" });
    expect(store.services).toHaveLength(0);
  });

  it("16) membership revogada é negada", () => {
    const store = createEmptyServiceMutationStore(products);
    const result = createServiceAtomic(
      store,
      { ...owner, accessRevokedAt: "2026-09-01T00:00:00.000Z" },
      fixedInput(),
    );
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("17) company A não altera B", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(store, owner, fixedInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const other: ServiceMutationActor = {
      companyId: COMPANY_B,
      hasServicesManage: true,
      accessRevokedAt: null,
    };
    const result = updateServiceAtomic(
      store,
      other,
      fixedInput({
        companyId: COMPANY_B,
        serviceId: created.serviceId,
        idempotencyKey: KEY_2,
      }),
    );
    expect(result).toEqual({ ok: false, error: "service_not_found" });
    expect(store.services[0]?.name).toBe("Banho");
  });

  it("18) retry da mesma idempotency key devolve o mesmo serviço", () => {
    const store = createEmptyServiceMutationStore(products);
    const first = createServiceAtomic(store, owner, fixedInput());
    const second = createServiceAtomic(store, owner, fixedInput());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.serviceId).toBe(first.serviceId);
    expect(store.services).toHaveLength(1);
  });

  it("19) mesma key + payload diferente → conflito", () => {
    const store = createEmptyServiceMutationStore(products);
    createServiceAtomic(store, owner, fixedInput());
    const conflict = createServiceAtomic(
      store,
      owner,
      fixedInput({ name: "Outro nome" }),
    );
    expect(conflict).toEqual({ ok: false, error: "idempotency_key_conflict" });
    expect(store.services).toHaveLength(1);
    expect(store.services[0]?.name).toBe("Banho");
  });

  it("20) updates sequenciais no mesmo serviço terminam integralmente no último payload", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(store, owner, fixedInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const results = applySequentialUpdates(store, owner, [
      fixedInput({
        serviceId: created.serviceId,
        name: "Request A",
        priceCents: 1111,
        recipes: [{ productId: PRODUCT_A1, quantity: 1 }],
        idempotencyKey: KEY_2,
      }),
      fixedInput({
        serviceId: created.serviceId,
        name: "Request B",
        priceCents: 2222,
        recipes: [{ productId: PRODUCT_A2, quantity: 2 }],
        idempotencyKey: KEY_3,
      }),
    ]);

    expect(results.every((row) => row.ok)).toBe(true);
    expect(store.services).toHaveLength(1);
    const final = store.services[0]!;
    const isA =
      final.name === "Request A" &&
      final.priceCents === 1111 &&
      final.recipes[0]?.productId === PRODUCT_A1;
    const isB =
      final.name === "Request B" &&
      final.priceCents === 2222 &&
      final.recipes[0]?.productId === PRODUCT_A2;
    expect(isA || isB).toBe(true);
    expect(isA && isB).toBe(false);
  });

  it("21) nenhuma combinação parcial de core/preço/ficha após erro", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(
      store,
      owner,
      fixedInput({
        name: "Core antigo",
        priceCents: 3000,
        recipes: [{ productId: PRODUCT_A1, quantity: 4 }],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    updateServiceAtomic(
      store,
      owner,
      fixedInput({
        serviceId: created.serviceId,
        name: "Core novo",
        priceCents: 4000,
        recipes: [{ productId: PRODUCT_A1, quantity: 0 }],
        idempotencyKey: KEY_2,
      }),
    );

    expect(store.services[0]?.name).toBe("Core antigo");
    expect(store.services[0]?.priceCents).toBe(3000);
    expect(store.services[0]?.recipes).toEqual([{ productId: PRODUCT_A1, quantity: 4 }]);
  });

  it("22) formulário continua aceitando fixed, by_size e ficha JSON", () => {
    expect(parseRecipesJson("[]")).toEqual([]);
    expect(parseRecipesJson('[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":2}]')).toEqual(
      [{ productId: PRODUCT_A1, quantity: 2 }],
    );
    expect(parseRecipesJson("nao-json")).toBeNull();
  });
});

describe("fingerprint canônico", () => {
  it("ordem da ficha não muda o fingerprint", () => {
    const a = serviceMutationFingerprint({
      name: "Banho",
      description: null,
      pricingMode: "fixed",
      priceCents: 100,
      durationMinutes: 30,
      active: true,
      sizePrices: null,
      recipes: [
        { productId: PRODUCT_A2, quantity: 2 },
        { productId: PRODUCT_A1, quantity: 1 },
      ],
    });
    const b = serviceMutationFingerprint({
      name: "Banho",
      description: null,
      pricingMode: "fixed",
      priceCents: 100,
      durationMinutes: 30,
      active: true,
      sizePrices: null,
      recipes: [
        { productId: PRODUCT_A1, quantity: 1 },
        { productId: PRODUCT_A2, quantity: 2 },
      ],
    });
    expect(a).toBe(b);
  });
});

describe("BLOCO 8.1 hardening — UPDATE idempotente por serviço", () => {
  const payloadP = {
    name: "Payload P",
    priceCents: 5500,
    recipes: [{ productId: PRODUCT_A1, quantity: 1 }],
  };

  it("A) retry UPDATE no mesmo serviço com a mesma key e o mesmo payload → replay", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(store, owner, fixedInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: created.serviceId,
        idempotencyKey: KEY_2,
      }),
    );
    const snapshot = structuredClone(store.services[0]);
    const retry = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: created.serviceId,
        idempotencyKey: KEY_2,
      }),
    );

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.serviceId).toBe(created.serviceId);
    expect(retry.serviceId).toBe(first.serviceId);
    expect(store.services).toHaveLength(1);
    expect(store.services[0]).toEqual(snapshot);
  });

  it("B) mesma UPDATE key + mesmo payload em OUTRO serviço → conflito", () => {
    const store = createEmptyServiceMutationStore(products);
    const serviceA = createServiceAtomic(store, owner, fixedInput({ idempotencyKey: "create-svc-a-0001" }));
    const serviceB = createServiceAtomic(store, owner, fixedInput({ name: "Outro", idempotencyKey: "create-svc-b-0001" }));
    expect(serviceA.ok && serviceB.ok).toBe(true);
    if (!serviceA.ok || !serviceB.ok) return;

    const updateA = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: serviceA.serviceId,
        idempotencyKey: KEY_2,
      }),
    );
    expect(updateA.ok).toBe(true);

    const updateB = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: serviceB.serviceId,
        idempotencyKey: KEY_2,
      }),
    );

    expect(updateB).toEqual({ ok: false, error: "idempotency_key_conflict" });
    expect(store.services.find((row) => row.id === serviceA.serviceId)?.name).toBe("Payload P");
    expect(store.services.find((row) => row.id === serviceB.serviceId)?.name).toBe("Outro");
    expect(updateB.ok === false || updateB.serviceId !== serviceA.serviceId).toBe(true);
  });

  it("C) mesma UPDATE key + mesmo serviço + payload diferente → conflito", () => {
    const store = createEmptyServiceMutationStore(products);
    const created = createServiceAtomic(store, owner, fixedInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: created.serviceId,
        idempotencyKey: KEY_2,
      }),
    );

    const conflict = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        serviceId: created.serviceId,
        name: "Payload Q",
        priceCents: 8800,
        idempotencyKey: KEY_2,
      }),
    );

    expect(conflict).toEqual({ ok: false, error: "idempotency_key_conflict" });
    expect(store.services[0]?.name).toBe("Payload P");
    expect(store.services[0]?.priceCents).toBe(5500);
  });

  it("D) duas empresas podem usar a mesma key sem colisão", () => {
    const store = createEmptyServiceMutationStore(products);
    const actorB: ServiceMutationActor = {
      companyId: COMPANY_B,
      hasServicesManage: true,
      accessRevokedAt: null,
    };

    const createdA = createServiceAtomic(store, owner, fixedInput({ idempotencyKey: KEY_1 }));
    const createdB = createServiceAtomic(
      store,
      actorB,
      fixedInput({
        companyId: COMPANY_B,
        name: "Banho B",
        idempotencyKey: KEY_1,
      }),
    );

    expect(createdA.ok && createdB.ok).toBe(true);
    if (!createdA.ok || !createdB.ok) return;
    expect(createdA.serviceId).not.toBe(createdB.serviceId);
    expect(store.services).toHaveLength(2);

    const updateA = updateServiceAtomic(
      store,
      owner,
      fixedInput({
        ...payloadP,
        serviceId: createdA.serviceId,
        idempotencyKey: KEY_2,
      }),
    );
    const updateB = updateServiceAtomic(
      store,
      actorB,
      fixedInput({
        companyId: COMPANY_B,
        name: "Payload P empresa B",
        priceCents: 5500,
        recipes: [],
        serviceId: createdB.serviceId,
        idempotencyKey: KEY_2,
      }),
    );

    expect(updateA.ok && updateB.ok).toBe(true);
    expect(store.services.find((row) => row.id === createdA.serviceId)?.name).toBe("Payload P");
    expect(store.services.find((row) => row.id === createdB.serviceId)?.name).toBe(
      "Payload P empresa B",
    );
  });

  it("E) CREATE continua com retry da mesma key", () => {
    const store = createEmptyServiceMutationStore(products);
    const first = createServiceAtomic(store, owner, fixedInput());
    const second = createServiceAtomic(store, owner, fixedInput());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.replayed).toBe(true);
    expect(store.services).toHaveLength(1);
  });
});
