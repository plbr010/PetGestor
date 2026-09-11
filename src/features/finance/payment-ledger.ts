import {
  classifyCancel,
  classifyReopen,
  deriveFinancialStatus,
  receivedCents,
  remainingCents,
  type ActiveFinancialPayment,
} from "@/features/finance/ledger";
import type { FinancialEntryStatus, FinancialSourceType, PaymentMethod } from "@/types/database.types";

export type LedgerEntry = {
  id: string;
  companyId: string;
  sourceType: FinancialSourceType;
  status: FinancialEntryStatus;
  amountCents: number;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  packageId?: string | null;
};

export type LedgerPayment = ActiveFinancialPayment & {
  id: string;
  companyId: string;
  idempotencyKey: string | null;
};

export type PaymentStore = {
  entries: LedgerEntry[];
  payments: LedgerPayment[];
  packages: Array<{ id: string; financialStatus: "pending" | "paid" | "cancelled" }>;
};

export type RegisterPaymentInput = {
  companyId: string;
  entryId: string;
  amountCents: number | null;
  paymentMethod: PaymentMethod;
  paidAt?: string;
  idempotencyKey: string;
};

export type RegisterPaymentResult =
  | { ok: true; entryId: string; idempotent: boolean }
  | { ok: false; error: string };

let nextPaymentId = 1;

function snapshot(entry: LedgerEntry, payments: LedgerPayment[]) {
  return {
    amountCents: entry.amountCents,
    status: entry.status,
    payments: payments.filter(
      (payment) => payment.entryId === entry.id && payment.companyId === entry.companyId,
    ),
  };
}

function syncEntry(store: PaymentStore, entry: LedgerEntry) {
  if (entry.status === "cancelled") {
    return;
  }

  const active = store.payments.filter(
    (payment) =>
      payment.entryId === entry.id &&
      payment.companyId === entry.companyId &&
      payment.cancelledAt == null,
  );
  const received = active.reduce((sum, payment) => sum + payment.amountCents, 0);
  const last = [...active].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
  entry.status = deriveFinancialStatus({
    amountCents: entry.amountCents,
    receivedCents: received,
  });

  if (entry.status === "paid" && last) {
    entry.paymentMethod = last.paymentMethod;
    entry.paidAt = last.paidAt;
  } else if (entry.status === "pending") {
    entry.paymentMethod = null;
    entry.paidAt = null;
  } else {
    entry.paymentMethod = null;
    entry.paidAt = null;
  }

  if (entry.sourceType === "service_package" && entry.packageId) {
    const pkg = store.packages.find((item) => item.id === entry.packageId);
    if (pkg && pkg.financialStatus !== "cancelled") {
      pkg.financialStatus = entry.status === "paid" ? "paid" : "pending";
    }
  }
}

export function createPaymentStore(): PaymentStore {
  return { entries: [], payments: [], packages: [] };
}

export function registerFinancialPayment(
  store: PaymentStore,
  input: RegisterPaymentInput,
): RegisterPaymentResult {
  const existing = store.payments.find(
    (payment) =>
      payment.companyId === input.companyId &&
      payment.idempotencyKey === input.idempotencyKey &&
      payment.cancelledAt == null,
  );

  if (existing) {
    return { ok: true, entryId: existing.entryId, idempotent: true };
  }

  const entry = store.entries.find(
    (item) => item.id === input.entryId && item.companyId === input.companyId,
  );

  if (!entry) {
    return { ok: false, error: "financial_entry_not_found" };
  }

  if (entry.status === "cancelled") {
    return { ok: false, error: "invalid_status_transition" };
  }

  if (entry.sourceType === "sale") {
    return { ok: false, error: "sale_entry_not_payable_via_finance" };
  }

  const current = snapshot(entry, store.payments);
  const remaining = remainingCents(current);
  const amount = input.amountCents ?? remaining;

  if (amount <= 0) {
    if (remaining === 0) {
      return { ok: true, entryId: entry.id, idempotent: true };
    }

    return { ok: false, error: "invalid_payment_amount" };
  }

  if (amount > remaining) {
    return { ok: false, error: "payment_exceeds_balance" };
  }

  nextPaymentId += 1;
  store.payments.push({
    id: `pay-${nextPaymentId}`,
    entryId: entry.id,
    companyId: input.companyId,
    amountCents: amount,
    paymentMethod: input.paymentMethod,
    paidAt: input.paidAt ?? "2026-09-11T12:00:00.000Z",
    cancelledAt: null,
    idempotencyKey: input.idempotencyKey,
  });

  syncEntry(store, entry);
  return { ok: true, entryId: entry.id, idempotent: false };
}

export function applyConcurrentPayments(
  store: PaymentStore,
  first: RegisterPaymentInput,
  second: RegisterPaymentInput,
): { first: RegisterPaymentResult; second: RegisterPaymentResult } {
  return {
    first: registerFinancialPayment(store, first),
    second: registerFinancialPayment(store, second),
  };
}

export function reopenEntry(
  store: PaymentStore,
  companyId: string,
  entryId: string,
): { ok: true } | { ok: false; error: string } {
  const entry = store.entries.find((item) => item.id === entryId && item.companyId === companyId);
  if (!entry) {
    return { ok: false, error: "financial_entry_not_found" };
  }

  const decision = classifyReopen(entry.sourceType, entry.status);
  if (!decision.allowed) {
    return { ok: false, error: decision.error };
  }

  for (const payment of store.payments) {
    if (
      payment.entryId === entry.id &&
      payment.companyId === companyId &&
      payment.cancelledAt == null
    ) {
      payment.cancelledAt = "2026-09-11T13:00:00.000Z";
    }
  }

  syncEntry(store, entry);
  return { ok: true };
}

export function cancelEntry(
  store: PaymentStore,
  companyId: string,
  entryId: string,
): { ok: true } | { ok: false; error: string } {
  const entry = store.entries.find((item) => item.id === entryId && item.companyId === companyId);
  if (!entry) {
    return { ok: false, error: "financial_entry_not_found" };
  }

  const received = receivedCents(snapshot(entry, store.payments));
  const decision = classifyCancel(entry.sourceType, entry.status, received);
  if (!decision.allowed) {
    return { ok: false, error: decision.error };
  }

  entry.status = "cancelled";
  return { ok: true };
}
