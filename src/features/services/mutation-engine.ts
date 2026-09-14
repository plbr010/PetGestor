import { parseQuantityInput } from "@/features/inventory/stock-engine";
import {
  assertValidRecipeItems,
  recipesToRpcPayload,
  serviceMutationFingerprint,
  type ServiceMutationPayload,
  type ServiceRecipeInput,
  type ServiceSizePriceInput,
} from "@/features/services/mutation-policy";
import { isValidUuid } from "@/lib/security/uuid";

export type ServiceMutationActor = {
  companyId: string;
  hasServicesManage: boolean;
  accessRevokedAt: string | null;
};

export type ServiceMutationProduct = {
  id: string;
  companyId: string;
  archivedAt: string | null;
};

export type StoredService = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  pricingMode: "fixed" | "by_size";
  priceCents: number | null;
  durationMinutes: number;
  active: boolean;
  deletedAt: string | null;
  sizePrices: ServiceSizePriceInput[];
  recipes: ServiceRecipeInput[];
};

type Attempt = {
  companyId: string;
  operation: "create" | "update";
  idempotencyKey: string;
  fingerprint: string;
  serviceId: string;
};

export type ServiceMutationStore = {
  products: ServiceMutationProduct[];
  services: StoredService[];
  attempts: Attempt[];
  locks: Set<string>;
};

export type ServiceMutationInput = ServiceMutationPayload & {
  companyId: string;
  idempotencyKey: string;
  serviceId?: string;
};

export type ServiceMutationResult =
  | { ok: true; serviceId: string; replayed: boolean }
  | { ok: false; error: string };

let nextServiceId = 1;

export function createEmptyServiceMutationStore(
  products: ServiceMutationProduct[] = [],
): ServiceMutationStore {
  return {
    products,
    services: [],
    attempts: [],
    locks: new Set(),
  };
}

function authorize(actor: ServiceMutationActor, companyId: string): string | null {
  if (actor.accessRevokedAt != null) {
    return "not_found";
  }
  if (actor.companyId !== companyId) {
    return "not_found";
  }
  if (!actor.hasServicesManage) {
    return "permission_denied";
  }
  return null;
}

function snapshot(service: StoredService): StoredService {
  return {
    ...service,
    sizePrices: service.sizePrices.map((row) => ({ ...row })),
    recipes: service.recipes.map((row) => ({ ...row })),
  };
}

function applyRecipes(
  store: ServiceMutationStore,
  companyId: string,
  recipes: ServiceRecipeInput[],
): string | null {
  const validity = assertValidRecipeItems(recipes);
  if (!validity.ok) {
    return validity.error;
  }

  for (const item of recipes) {
    const product = store.products.find((row) => row.id === item.productId);
    if (!product || product.companyId !== companyId || product.archivedAt != null) {
      return "product_not_found";
    }
  }

  return null;
}

function applyCore(input: ServiceMutationInput): Omit<StoredService, "id" | "companyId" | "recipes" | "deletedAt"> | string {
  if (input.pricingMode === "fixed") {
    if (input.priceCents == null || input.priceCents < 0 || input.priceCents > 999999) {
      return "invalid_price_cents";
    }
    if (input.durationMinutes < 5 || input.durationMinutes > 720) {
      return "invalid_duration_minutes";
    }
    return {
      name: input.name.trim(),
      description: input.description,
      pricingMode: "fixed",
      priceCents: input.priceCents,
      durationMinutes: input.durationMinutes,
      active: input.active,
      sizePrices: [],
    };
  }

  const sizes = input.sizePrices ?? [];
  if (sizes.length !== 4) {
    return "invalid_size_prices";
  }

  return {
    name: input.name.trim(),
    description: input.description,
    pricingMode: "by_size",
    priceCents: null,
    durationMinutes: Math.min(...sizes.map((row) => row.durationMinutes)),
    active: input.active,
    sizePrices: sizes.map((row) => ({ ...row })),
  };
}

function lockKey(operation: "create" | "update", companyId: string, token: string): string {
  return `${companyId}:${operation}:${token}`;
}

function withLock<T>(store: ServiceMutationStore, key: string, fn: () => T): T {
  if (store.locks.has(key)) {
    throw new Error("lock_busy");
  }
  store.locks.add(key);
  try {
    return fn();
  } finally {
    store.locks.delete(key);
  }
}

function runMutation(
  store: ServiceMutationStore,
  actor: ServiceMutationActor,
  operation: "create" | "update",
  input: ServiceMutationInput,
): ServiceMutationResult {
  const denied = authorize(actor, input.companyId);
  if (denied) {
    return { ok: false, error: denied };
  }

  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    return { ok: false, error: "invalid_idempotency_key" };
  }

  const fingerprint = serviceMutationFingerprint(input);
  const attemptKey = lockKey(
    operation,
    input.companyId,
    operation === "create" ? input.idempotencyKey : (input.serviceId ?? input.idempotencyKey),
  );

  return withLock(store, attemptKey, () => {
    const existingAttempt = store.attempts.find(
      (row) =>
        row.companyId === input.companyId &&
        row.operation === operation &&
        row.idempotencyKey === input.idempotencyKey,
    );

    if (existingAttempt) {
      if (existingAttempt.fingerprint !== fingerprint) {
        return { ok: false, error: "idempotency_key_conflict" };
      }
      return { ok: true, serviceId: existingAttempt.serviceId, replayed: true };
    }

    const backup = store.services.map(snapshot);

    try {
      const recipeError = applyRecipes(store, input.companyId, input.recipes);
      if (recipeError) {
        throw new Error(recipeError);
      }

      const core = applyCore(input);
      if (typeof core === "string") {
        throw new Error(core);
      }

      let serviceId: string;

      if (operation === "create") {
        serviceId = `svc-${nextServiceId++}`;
        store.services.push({
          id: serviceId,
          companyId: input.companyId,
          deletedAt: null,
          recipes: input.recipes.map((row) => ({ ...row })),
          ...core,
        });
      } else {
        if (!input.serviceId) {
          throw new Error("service_not_found");
        }
        const index = store.services.findIndex(
          (row) =>
            row.id === input.serviceId &&
            row.companyId === input.companyId &&
            row.deletedAt == null,
        );
        if (index < 0) {
          throw new Error("service_not_found");
        }
        serviceId = input.serviceId;
        store.services[index] = {
          ...store.services[index]!,
          ...core,
          recipes: input.recipes.map((row) => ({ ...row })),
        };
      }

      store.attempts.push({
        companyId: input.companyId,
        operation,
        idempotencyKey: input.idempotencyKey,
        fingerprint,
        serviceId,
      });

      return { ok: true, serviceId, replayed: false };
    } catch (error) {
      store.services.splice(0, store.services.length, ...backup);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "mutation_failed",
      };
    }
  });
}

export function createServiceAtomic(
  store: ServiceMutationStore,
  actor: ServiceMutationActor,
  input: ServiceMutationInput,
): ServiceMutationResult {
  return runMutation(store, actor, "create", input);
}

export function updateServiceAtomic(
  store: ServiceMutationStore,
  actor: ServiceMutationActor,
  input: ServiceMutationInput,
): ServiceMutationResult {
  return runMutation(store, actor, "update", input);
}

export function applyConcurrentUpdates(
  store: ServiceMutationStore,
  actor: ServiceMutationActor,
  inputs: ServiceMutationInput[],
): ServiceMutationResult[] {
  return inputs.map((input) => updateServiceAtomic(store, actor, input));
}

export function parseRecipesJson(raw: unknown): ServiceRecipeInput[] | null {
  if (raw == null || raw === "") {
    return [];
  }

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const items: ServiceRecipeInput[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const record = row as Record<string, unknown>;
    const productId = String(record.product_id ?? record.productId ?? "");
    const quantity =
      typeof record.quantity === "number"
        ? record.quantity
        : parseQuantityInput(String(record.quantity ?? ""));
    if (!isValidUuid(productId) || quantity == null) {
      return null;
    }
    items.push({ productId, quantity });
  }

  return items;
}

export { recipesToRpcPayload };
