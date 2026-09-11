import type { ServiceOrderStatus } from "@/types/database.types";

export type ServiceOrderMutationRpc = {
  id: string;
  status?: ServiceOrderStatus;
  changed?: boolean;
  idempotent?: boolean;
  created?: boolean;
};

export type ServiceOrderMutationOutcome =
  | { kind: "applied"; id: string; status?: ServiceOrderStatus }
  | { kind: "idempotent"; id: string; status?: ServiceOrderStatus }
  | { kind: "not_found" };

/**
 * Interpreta o retorno da RPC operacional.
 * Aceita uuid legado ou jsonb `{ id, changed, idempotent }`.
 */
export function parseServiceOrderMutationRpc(value: unknown): ServiceOrderMutationRpc | null {
  if (typeof value === "string" && value.length > 0) {
    return { id: value, changed: true, idempotent: false };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }

  return {
    id: record.id,
    status: typeof record.status === "string" ? (record.status as ServiceOrderStatus) : undefined,
    changed: record.changed === true,
    idempotent: record.idempotent === true,
    created: record.created === true,
  };
}

export function interpretServiceOrderMutation(input: {
  rpc: ServiceOrderMutationRpc | null;
  alreadyInTarget?: boolean;
}): ServiceOrderMutationOutcome {
  const { rpc, alreadyInTarget } = input;

  if (!rpc) {
    return { kind: "not_found" };
  }

  if (rpc.idempotent || rpc.changed === false || alreadyInTarget) {
    return { kind: "idempotent", id: rpc.id, status: rpc.status };
  }

  return { kind: "applied", id: rpc.id, status: rpc.status };
}

export function shouldEmitServiceOrderSideEffects(
  outcome: ServiceOrderMutationOutcome,
): boolean {
  return outcome.kind === "applied";
}

export function extractServiceOrderId(value: unknown): string | null {
  return parseServiceOrderMutationRpc(value)?.id ?? null;
}
