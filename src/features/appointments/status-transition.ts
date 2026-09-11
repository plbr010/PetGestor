import { canTransitionStatus } from "@/features/appointments/status";
import type { AppointmentStatus } from "@/types/database.types";

export type StatusTransitionOutcome =
  | { kind: "applied"; status: AppointmentStatus }
  | { kind: "idempotent"; status: AppointmentStatus }
  | { kind: "conflict"; status: AppointmentStatus }
  | { kind: "not_found" };

export type StatusTransitionRpcResult = {
  id: string;
  status: AppointmentStatus;
  changed: boolean;
  idempotent?: boolean;
  following_updated?: number;
};

/**
 * Interpreta o resultado atômico da RPC de transição.
 * Efeitos derivados (notificações, estorno) só devem ocorrer quando kind === "applied".
 */
export function interpretStatusTransitionResult(input: {
  requested: AppointmentStatus;
  rpc: StatusTransitionRpcResult | null;
  currentStatus?: AppointmentStatus | null;
}): StatusTransitionOutcome {
  const { requested, rpc, currentStatus } = input;

  if (rpc) {
    if (rpc.changed) {
      return { kind: "applied", status: rpc.status };
    }

    if (rpc.idempotent || rpc.status === requested) {
      return { kind: "idempotent", status: rpc.status };
    }

    return { kind: "conflict", status: rpc.status };
  }

  if (!currentStatus) {
    return { kind: "not_found" };
  }

  if (currentStatus === requested) {
    return { kind: "idempotent", status: currentStatus };
  }

  if (!canTransitionStatus(currentStatus, requested)) {
    return { kind: "conflict", status: currentStatus };
  }

  return { kind: "conflict", status: currentStatus };
}

export function shouldEmitStatusSideEffects(outcome: StatusTransitionOutcome): boolean {
  return outcome.kind === "applied";
}

export const SKIPPABLE_RECURRENCE_ERRORS = [
  "outside_working_hours",
  "lunch_break_conflict",
  "employee_schedule_conflict",
  "pet_schedule_conflict",
  "time_block_conflict",
  "appointment_in_past",
] as const;

export function isSkippableRecurrenceError(message: string | undefined): boolean {
  const code = message ?? "";
  return SKIPPABLE_RECURRENCE_ERRORS.some((item) => code.includes(item));
}

export type RecurrenceAttempt =
  | { ok: true; id: string }
  | { ok: false; skippable: boolean; error: string };

export type RecurrencePlanResult =
  | { abort: true; reason: string }
  | { abort: false; createdIds: string[]; skippedCount: number };

/**
 * Decisão de persistência da série. Se abortar, a transação SQL não commita nada.
 * Conflitos skippable geram série parcial explícita; erro estrutural aborta tudo.
 */
export function reduceRecurrenceAttempts(attempts: RecurrenceAttempt[]): RecurrencePlanResult {
  const createdIds: string[] = [];
  let skippedCount = 0;

  for (const attempt of attempts) {
    if (attempt.ok) {
      createdIds.push(attempt.id);
      continue;
    }

    if (!attempt.skippable) {
      return { abort: true, reason: attempt.error };
    }

    skippedCount += 1;
  }

  if (createdIds.length === 0) {
    return { abort: true, reason: "recurrence_no_occurrences" };
  }

  return { abort: false, createdIds, skippedCount };
}
