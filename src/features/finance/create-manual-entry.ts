import {
  createPaymentStore,
  registerFinancialPayment,
  type LedgerEntry,
  type PaymentStore,
} from "@/features/finance/payment-ledger";
import type { PaymentMethod } from "@/types/database.types";

export type CreateManualActor = {
  companyId: string;
  hasFinanceCreate: boolean;
  accessRevokedAt: string | null;
};

export type CreateManualInput = {
  companyId: string;
  entryType: "income" | "expense";
  description: string;
  category: string | null;
  amountCents: number;
  dueDate: string | null;
  notes: string | null;
  desiredStatus: "pending" | "paid";
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  idempotencyKey: string;
};

export type CreateManualResult =
  | { ok: true; entryId: string; created: boolean }
  | { ok: false; error: string };

let nextManualEntryId = 1;

export function createEmptyManualLedger(): PaymentStore {
  return createPaymentStore();
}

function authorizeCreate(actor: CreateManualActor, companyId: string): string | null {
  if (actor.accessRevokedAt != null) {
    return "not_found";
  }

  if (actor.companyId !== companyId) {
    return "not_found";
  }

  if (!actor.hasFinanceCreate) {
    return "permission_denied";
  }

  return null;
}

function normalizeBlank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

function payloadMatches(entry: LedgerEntry, input: CreateManualInput): boolean {
  const desiredMatches =
    input.desiredStatus === "pending"
      ? entry.status === "pending"
      : entry.status === "paid";

  if (!desiredMatches) {
    return false;
  }

  if (input.desiredStatus === "paid" && entry.paymentMethod !== input.paymentMethod) {
    return false;
  }

  return (
    entry.sourceType === "manual" &&
    (entry.entryType ?? "income") === input.entryType &&
    (entry.description ?? "").trim() === input.description.trim() &&
    normalizeBlank(entry.category ?? null) === normalizeBlank(input.category) &&
    entry.amountCents === input.amountCents &&
    (entry.dueDate ?? null) === (input.dueDate ?? null) &&
    normalizeBlank(entry.notes ?? null) === normalizeBlank(input.notes)
  );
}

/**
 * Modelo da RPC `create_manual_financial_entry`: uma transação.
 * Falha ao criar o payment não deixa entry pending persistida.
 */
export function createManualFinancialEntry(
  store: PaymentStore,
  actor: CreateManualActor,
  input: CreateManualInput,
  options?: { failPayment?: boolean },
): CreateManualResult {
  const authError = authorizeCreate(actor, input.companyId);
  if (authError) {
    return { ok: false, error: authError };
  }

  const key = input.idempotencyKey.trim();
  if (key.length < 8) {
    return { ok: false, error: "invalid_idempotency_key" };
  }

  if (input.desiredStatus === "paid" && !input.paymentMethod) {
    return { ok: false, error: "invalid_payment_method" };
  }

  if (input.desiredStatus === "pending" && input.paymentMethod) {
    return { ok: false, error: "invalid_payment_method" };
  }

  const existing = store.entries.find(
    (entry) => entry.companyId === input.companyId && entry.idempotencyKey === key,
  );

  if (existing) {
    if (!payloadMatches(existing, input)) {
      return { ok: false, error: "idempotency_key_conflict" };
    }

    return { ok: true, entryId: existing.id, created: false };
  }

  nextManualEntryId += 1;
  const entryId = `manual-${nextManualEntryId}`;
  const entry: LedgerEntry = {
    id: entryId,
    companyId: input.companyId,
    sourceType: "manual",
    status: "pending",
    amountCents: input.amountCents,
    paymentMethod: null,
    paidAt: null,
    idempotencyKey: key,
    entryType: input.entryType,
    description: input.description.trim(),
    category: normalizeBlank(input.category),
    dueDate: input.dueDate,
    notes: normalizeBlank(input.notes),
  };

  store.entries.push(entry);

  if (input.desiredStatus === "paid") {
    if (options?.failPayment) {
      store.entries = store.entries.filter((item) => item.id !== entryId);
      store.payments = store.payments.filter((payment) => payment.entryId !== entryId);
      return { ok: false, error: "payment_failed" };
    }

    const paid = registerFinancialPayment(store, {
      companyId: input.companyId,
      entryId,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod!,
      paidAt: input.paidAt ?? undefined,
      idempotencyKey: `manual-create:${key}`,
    });

    if (!paid.ok) {
      store.entries = store.entries.filter((item) => item.id !== entryId);
      store.payments = store.payments.filter((payment) => payment.entryId !== entryId);
      return { ok: false, error: paid.error };
    }
  }

  return { ok: true, entryId, created: true };
}

export function applyConcurrentManualCreates(
  store: PaymentStore,
  actor: CreateManualActor,
  input: CreateManualInput,
): { first: CreateManualResult; second: CreateManualResult } {
  return {
    first: createManualFinancialEntry(store, actor, input),
    second: createManualFinancialEntry(store, actor, input),
  };
}
