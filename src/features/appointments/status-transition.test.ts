import { describe, expect, it } from "vitest";

import {
  interpretStatusTransitionResult,
  isSkippableRecurrenceError,
  reduceRecurrenceAttempts,
  shouldEmitStatusSideEffects,
} from "@/features/appointments/status-transition";

describe("transições de status concorrentes", () => {
  it("confirmar duas vezes é idempotente e não dispara efeito de novo", () => {
    const first = interpretStatusTransitionResult({
      requested: "confirmed",
      rpc: { id: "a1", status: "confirmed", changed: true },
    });
    const retry = interpretStatusTransitionResult({
      requested: "confirmed",
      rpc: { id: "a1", status: "confirmed", changed: false, idempotent: true },
    });

    expect(first).toEqual({ kind: "applied", status: "confirmed" });
    expect(retry).toEqual({ kind: "idempotent", status: "confirmed" });
    expect(shouldEmitStatusSideEffects(first)).toBe(true);
    expect(shouldEmitStatusSideEffects(retry)).toBe(false);
  });

  it("cancelar duas vezes é idempotente", () => {
    const retry = interpretStatusTransitionResult({
      requested: "cancelled",
      rpc: { id: "a1", status: "cancelled", changed: false, idempotent: true },
    });
    expect(retry.kind).toBe("idempotent");
    expect(shouldEmitStatusSideEffects(retry)).toBe(false);
  });

  it("no-show duas vezes é idempotente", () => {
    const retry = interpretStatusTransitionResult({
      requested: "no_show",
      rpc: { id: "a1", status: "no_show", changed: false, idempotent: true },
    });
    expect(retry.kind).toBe("idempotent");
  });

  it("confirmar e cancelar concorrentes: o segundo vira conflito", () => {
    const confirmWins = interpretStatusTransitionResult({
      requested: "cancelled",
      rpc: { id: "a1", status: "confirmed", changed: false },
    });
    expect(confirmWins).toEqual({ kind: "conflict", status: "confirmed" });
    expect(shouldEmitStatusSideEffects(confirmWins)).toBe(false);
  });

  it("retry após timeout da ação já aplicada não reemite efeitos", () => {
    const timeoutRetry = interpretStatusTransitionResult({
      requested: "confirmed",
      rpc: { id: "a1", status: "confirmed", changed: false, idempotent: true },
    });
    expect(timeoutRetry.kind).toBe("idempotent");
    expect(shouldEmitStatusSideEffects(timeoutRetry)).toBe(false);
  });
});

describe("recorrência — plano atômico", () => {
  it("retry da mesma série não cria órfãos: resultado determinístico", () => {
    const first = reduceRecurrenceAttempts([
      { ok: true, id: "1" },
      { ok: false, skippable: true, error: "employee_schedule_conflict" },
      { ok: true, id: "3" },
    ]);
    expect(first).toEqual({ abort: false, createdIds: ["1", "3"], skippedCount: 1 });
  });

  it("falha estrutural no meio aborta tudo", () => {
    const aborted = reduceRecurrenceAttempts([
      { ok: true, id: "1" },
      { ok: false, skippable: false, error: "pet_unavailable" },
      { ok: true, id: "3" },
    ]);
    expect(aborted).toEqual({ abort: true, reason: "pet_unavailable" });
  });

  it("nenhuma ocorrência criada aborta a série", () => {
    expect(
      reduceRecurrenceAttempts([
        { ok: false, skippable: true, error: "employee_schedule_conflict" },
        { ok: false, skippable: true, error: "outside_working_hours" },
      ]),
    ).toEqual({ abort: true, reason: "recurrence_no_occurrences" });
  });

  it("conflito de ocorrência é skippable; pet indisponível não", () => {
    expect(isSkippableRecurrenceError("employee_schedule_conflict")).toBe(true);
    expect(isSkippableRecurrenceError("lunch_break_conflict")).toBe(true);
    expect(isSkippableRecurrenceError("pet_unavailable")).toBe(false);
  });
});
