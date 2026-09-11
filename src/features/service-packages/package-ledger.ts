import {
  canConsumePackage,
  isPackageExpiredOnCivilDate,
} from "@/features/service-packages/utils";
import type {
  CustomerPackageStatus,
  PackageFinancialStatus,
} from "@/features/service-packages/types";

export type LedgerUsage = {
  appointmentId: string;
  status: "consumed" | "reversed";
};

export type LedgerPackage = {
  id: string;
  companyId: string;
  customerId: string;
  petId: string;
  serviceId: string;
  catalogPackageId: string;
  idempotencyKey: string;
  operationalStatus: CustomerPackageStatus;
  financialStatus: PackageFinancialStatus;
  remaining: number;
  startsAt: string;
  expiresAt: string;
  priceCents: number;
  financialAmountCents: number;
  usages: LedgerUsage[];
};

export type LedgerStore = {
  packages: LedgerPackage[];
  financialEntries: Array<{
    id: string;
    packageId: string;
    status: PackageFinancialStatus;
    amountCents: number;
  }>;
};

export type SellAttempt = {
  companyId: string;
  customerId: string;
  petId: string;
  catalogPackageId: string;
  serviceId: string;
  idempotencyKey: string;
  financialStatus: "pending" | "paid";
  remaining: number;
  startsAt: string;
  expiresAt: string;
  priceCents: number;
};

export type SellResult =
  | { ok: true; packageId: string; created: boolean }
  | { ok: false; error: string };

let nextId = 1;

function createId(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function createLedgerStore(): LedgerStore {
  return { packages: [], financialEntries: [] };
}

export function sellPackage(store: LedgerStore, attempt: SellAttempt): SellResult {
  if (!attempt.idempotencyKey) {
    return { ok: false, error: "invalid_idempotency_key" };
  }

  if (attempt.priceCents <= 0) {
    return { ok: false, error: "invalid_price_cents" };
  }

  const existing = store.packages.find(
    (pkg) => pkg.companyId === attempt.companyId && pkg.idempotencyKey === attempt.idempotencyKey,
  );

  if (existing) {
    if (
      existing.catalogPackageId !== attempt.catalogPackageId ||
      existing.customerId !== attempt.customerId ||
      existing.petId !== attempt.petId
    ) {
      return { ok: false, error: "idempotency_key_conflict" };
    }

    return { ok: true, packageId: existing.id, created: false };
  }

  const id = createId("pkg");
  store.packages.push({
    id,
    companyId: attempt.companyId,
    customerId: attempt.customerId,
    petId: attempt.petId,
    serviceId: attempt.serviceId,
    catalogPackageId: attempt.catalogPackageId,
    idempotencyKey: attempt.idempotencyKey,
    operationalStatus: "active",
    financialStatus: attempt.financialStatus,
    remaining: attempt.remaining,
    startsAt: attempt.startsAt,
    expiresAt: attempt.expiresAt,
    priceCents: attempt.priceCents,
    financialAmountCents: attempt.priceCents,
    usages: [],
  });
  store.financialEntries.push({
    id: createId("fe"),
    packageId: id,
    status: attempt.financialStatus,
    amountCents: attempt.priceCents,
  });

  return { ok: true, packageId: id, created: true };
}

export function markPackagePaid(store: LedgerStore, packageId: string): SellResult {
  const pkg = store.packages.find((item) => item.id === packageId);
  const entry = store.financialEntries.find((item) => item.packageId === packageId);

  if (!pkg || !entry) {
    return { ok: false, error: "customer_package_not_found" };
  }

  if (entry.amountCents !== pkg.priceCents) {
    return { ok: false, error: "package_price_mismatch" };
  }

  entry.status = "paid";
  pkg.financialStatus = "paid";
  return { ok: true, packageId, created: false };
}

export type ConsumeResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; error: string };

export function consumeForAppointment(params: {
  store: LedgerStore;
  packageId: string;
  appointmentId: string;
  companyId: string;
  petId: string;
  serviceId: string;
  today: string;
  timeZone: string;
}): ConsumeResult {
  const pkg = params.store.packages.find((item) => item.id === params.packageId);

  if (!pkg || pkg.companyId !== params.companyId) {
    return { ok: false, error: "customer_package_not_found" };
  }

  const existing = pkg.usages.find(
    (usage) => usage.appointmentId === params.appointmentId && usage.status === "consumed",
  );

  if (existing) {
    return { ok: true, idempotent: true };
  }

  if (pkg.petId !== params.petId) {
    return { ok: false, error: "package_pet_mismatch" };
  }

  if (pkg.serviceId !== params.serviceId) {
    return { ok: false, error: "package_balance_unavailable" };
  }

  if (
    !canConsumePackage({
      status: pkg.operationalStatus,
      financialStatus: pkg.financialStatus,
      expiresAt: pkg.expiresAt,
      remainingForService: pkg.remaining,
      timeZone: params.timeZone,
      startsAt: pkg.startsAt,
      today: params.today,
    })
  ) {
    if (pkg.financialStatus !== "paid") {
      return { ok: false, error: "package_payment_pending" };
    }

    if (isPackageExpiredOnCivilDate(pkg.expiresAt, params.today) || pkg.operationalStatus === "expired") {
      pkg.operationalStatus = "expired";
      return { ok: false, error: "package_expired" };
    }

    if (pkg.remaining <= 0 || pkg.operationalStatus === "fully_used") {
      return { ok: false, error: "package_balance_unavailable" };
    }

    if (pkg.operationalStatus === "cancelled") {
      return { ok: false, error: "package_not_active" };
    }

    return { ok: false, error: "package_not_active" };
  }

  if (pkg.remaining <= 0) {
    return { ok: false, error: "package_balance_unavailable" };
  }

  pkg.remaining -= 1;
  pkg.usages.push({ appointmentId: params.appointmentId, status: "consumed" });

  if (pkg.remaining <= 0) {
    pkg.operationalStatus = "fully_used";
  }

  return { ok: true, idempotent: false };
}

export type ReverseResult =
  | { ok: true; reversed: boolean }
  | { ok: false; error: string };

export function reverseForAppointment(store: LedgerStore, appointmentId: string): ReverseResult {
  const pkg = store.packages.find((item) =>
    item.usages.some((usage) => usage.appointmentId === appointmentId && usage.status === "consumed"),
  );

  if (!pkg) {
    return { ok: true, reversed: false };
  }

  const usage = pkg.usages.find(
    (item) => item.appointmentId === appointmentId && item.status === "consumed",
  );

  if (!usage) {
    return { ok: true, reversed: false };
  }

  usage.status = "reversed";
  pkg.remaining += 1;

  if (pkg.operationalStatus === "fully_used" && pkg.remaining > 0) {
    pkg.operationalStatus = "active";
  }

  return { ok: true, reversed: true };
}

export type CancelResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; error: string };

export function cancelSoldPackage(store: LedgerStore, packageId: string): CancelResult {
  const pkg = store.packages.find((item) => item.id === packageId);
  const entry = store.financialEntries.find((item) => item.packageId === packageId);

  if (!pkg || !entry) {
    return { ok: false, error: "customer_package_not_found" };
  }

  const consumed = pkg.usages.some((usage) => usage.status === "consumed");

  if (pkg.operationalStatus === "cancelled") {
    if (entry.status === "pending") {
      entry.status = "cancelled";
      pkg.financialStatus = "cancelled";
    }

    return { ok: true, idempotent: true };
  }

  if (consumed) {
    return { ok: false, error: "package_has_usages" };
  }

  if (pkg.financialStatus === "paid" || entry.status === "paid") {
    return { ok: false, error: "package_paid_requires_refund" };
  }

  pkg.operationalStatus = "cancelled";
  entry.status = "cancelled";
  pkg.financialStatus = "cancelled";
  return { ok: true, idempotent: false };
}

/** Simula duas tentativas da última sessão sob lock: a segunda vê remaining já zerado. */
export function consumeLastSessionSerialized(
  params: Parameters<typeof consumeForAppointment>[0],
  secondAppointmentId: string,
): { first: ConsumeResult; second: ConsumeResult } {
  const first = consumeForAppointment(params);
  const second = consumeForAppointment({
    ...params,
    appointmentId: secondAppointmentId,
  });
  return { first, second };
}
