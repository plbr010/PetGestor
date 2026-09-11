import { describe, expect, it } from "vitest";

import {
  cancelSoldPackage,
  consumeForAppointment,
  consumeLastSessionSerialized,
  createLedgerStore,
  markPackagePaid,
  reverseForAppointment,
  sellPackage,
  type SellAttempt,
} from "@/features/service-packages/package-ledger";
import { isPackageExpiredOnCivilDate } from "@/features/service-packages/utils";
import { formatUtcDateInTimezone } from "@/lib/timezone";

const KEY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function attempt(overrides: Partial<SellAttempt> = {}): SellAttempt {
  return {
    companyId: "company-a",
    customerId: "customer-a",
    petId: "pet-a",
    catalogPackageId: "catalog-a",
    serviceId: "service-banho",
    idempotencyKey: KEY_A,
    financialStatus: "pending",
    remaining: 4,
    startsAt: "2026-09-01",
    expiresAt: "2026-09-30",
    priceCents: 16000,
    ...overrides,
  };
}

function consume(store: ReturnType<typeof createLedgerStore>, packageId: string, extras: {
  appointmentId?: string;
  today?: string;
  petId?: string;
  serviceId?: string;
  companyId?: string;
} = {}) {
  return consumeForAppointment({
    store,
    packageId,
    appointmentId: extras.appointmentId ?? "appt-1",
    companyId: extras.companyId ?? "company-a",
    petId: extras.petId ?? "pet-a",
    serviceId: extras.serviceId ?? "service-banho",
    today: extras.today ?? "2026-09-11",
    timeZone: "America/Sao_Paulo",
  });
}

describe("venda de pacote", () => {
  it("venda pending cria um único pacote e uma única receita pending", () => {
    const store = createLedgerStore();
    const first = sellPackage(store, attempt());

    expect(first).toEqual({ ok: true, packageId: expect.any(String), created: true });
    expect(store.packages).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(1);
    expect(store.packages[0]?.financialStatus).toBe("pending");
    expect(store.financialEntries[0]?.status).toBe("pending");
    expect(store.financialEntries[0]?.amountCents).toBe(16000);
  });

  it("pending não é consumível e não zera preço operacional", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt());
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(consume(store, sold.packageId)).toEqual({
      ok: false,
      error: "package_payment_pending",
    });
    expect(store.packages[0]?.remaining).toBe(4);
  });

  it("pending → paid ativa o mesmo pacote, sem recriar saldo nem receita", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt());
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    const paid = markPackagePaid(store, sold.packageId);
    expect(paid).toEqual({ ok: true, packageId: sold.packageId, created: false });
    expect(store.packages).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(1);
    expect(store.packages[0]?.financialStatus).toBe("paid");
    expect(store.packages[0]?.remaining).toBe(4);

    expect(consume(store, sold.packageId)).toEqual({ ok: true, idempotent: false });
    expect(store.packages[0]?.remaining).toBe(3);
  });

  it("venda paid nasce elegível com preço do servidor", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(store.packages[0]?.financialStatus).toBe("paid");
    expect(store.financialEntries[0]?.amountCents).toBe(store.packages[0]?.priceCents);
    expect(consume(store, sold.packageId)).toEqual({ ok: true, idempotent: false });
  });

  it("duplo clique / retry após timeout / duas requisições com a mesma chave = uma venda", () => {
    const store = createLedgerStore();
    const first = sellPackage(store, attempt());
    const retry = sellPackage(store, attempt());
    const concurrent = sellPackage(store, attempt());

    expect(first.ok && retry.ok && concurrent.ok).toBe(true);
    if (!first.ok || !retry.ok || !concurrent.ok) {
      return;
    }

    expect(retry.created).toBe(false);
    expect(concurrent.created).toBe(false);
    expect(retry.packageId).toBe(first.packageId);
    expect(concurrent.packageId).toBe(first.packageId);
    expect(store.packages).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(1);
  });

  it("duas chaves diferentes = duas vendas intencionais", () => {
    const store = createLedgerStore();
    sellPackage(store, attempt({ idempotencyKey: KEY_A }));
    sellPackage(store, attempt({ idempotencyKey: KEY_B }));

    expect(store.packages).toHaveLength(2);
    expect(store.financialEntries).toHaveLength(2);
  });

  it("rejeita preço zero na venda", () => {
    const store = createLedgerStore();
    expect(sellPackage(store, attempt({ priceCents: 0 }))).toEqual({
      ok: false,
      error: "invalid_price_cents",
    });
    expect(store.packages).toHaveLength(0);
  });
});

describe("consumo de sessão", () => {
  it("consome pacote paid ativo com saldo e é idempotente por appointment", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(consume(store, sold.packageId, { appointmentId: "appt-1" })).toEqual({
      ok: true,
      idempotent: false,
    });
    expect(consume(store, sold.packageId, { appointmentId: "appt-1" })).toEqual({
      ok: true,
      idempotent: true,
    });
    expect(store.packages[0]?.remaining).toBe(3);
  });

  it("bloqueia pending, expired, fully_used, cancelled, serviço e pet incompatíveis e cross-tenant", () => {
    const store = createLedgerStore();
    const pending = sellPackage(store, attempt({ financialStatus: "pending", idempotencyKey: KEY_A }));
    const paid = sellPackage(store, attempt({ financialStatus: "paid", idempotencyKey: KEY_B, remaining: 1 }));
    if (!pending.ok || !paid.ok) {
      throw new Error("expected sell");
    }

    expect(consume(store, pending.packageId)).toEqual({ ok: false, error: "package_payment_pending" });
    expect(consume(store, paid.packageId, { today: "2026-10-01" })).toEqual({
      ok: false,
      error: "package_expired",
    });
    expect(consume(store, paid.packageId, { serviceId: "tosa" })).toEqual({
      ok: false,
      error: "package_balance_unavailable",
    });
    expect(consume(store, paid.packageId, { petId: "pet-b" })).toEqual({
      ok: false,
      error: "package_pet_mismatch",
    });
    expect(consume(store, paid.packageId, { companyId: "company-b" })).toEqual({
      ok: false,
      error: "customer_package_not_found",
    });

    const used = sellPackage(
      store,
      attempt({
        financialStatus: "paid",
        remaining: 0,
        idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    );
    if (!used.ok) {
      throw new Error("expected sell");
    }
    store.packages.find((pkg) => pkg.id === used.packageId)!.operationalStatus = "fully_used";
    expect(consume(store, used.packageId)).toEqual({ ok: false, error: "package_balance_unavailable" });

    const cancelled = sellPackage(
      store,
      attempt({
        financialStatus: "paid",
        idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    );
    if (!cancelled.ok) {
      throw new Error("expected sell");
    }
    store.packages.find((pkg) => pkg.id === cancelled.packageId)!.operationalStatus = "cancelled";
    expect(consume(store, cancelled.packageId)).toEqual({ ok: false, error: "package_not_active" });
  });

  it("dois consumos concorrentes da última sessão: só um ganha e o saldo nunca fica negativo", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid", remaining: 1 }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    const raced = consumeLastSessionSerialized(
      {
        store,
        packageId: sold.packageId,
        appointmentId: "appt-1",
        companyId: "company-a",
        petId: "pet-a",
        serviceId: "service-banho",
        today: "2026-09-11",
        timeZone: "America/Sao_Paulo",
      },
      "appt-2",
    );

    expect(raced.first).toEqual({ ok: true, idempotent: false });
    expect(raced.second).toEqual({ ok: false, error: "package_balance_unavailable" });
    expect(store.packages[0]?.remaining).toBe(0);
    expect(store.packages[0]?.operationalStatus).toBe("fully_used");
  });
});

describe("devolução no cancelamento de appointment", () => {
  it("cancelamento devolve exatamente uma sessão e retry não devolve duas", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    consume(store, sold.packageId, { appointmentId: "appt-1" });
    expect(store.packages[0]?.remaining).toBe(3);

    expect(reverseForAppointment(store, "appt-1")).toEqual({ ok: true, reversed: true });
    expect(store.packages[0]?.remaining).toBe(4);
    expect(reverseForAppointment(store, "appt-1")).toEqual({ ok: true, reversed: false });
    expect(store.packages[0]?.remaining).toBe(4);
  });

  it("cancelar appointment sem consumo não altera saldo", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(reverseForAppointment(store, "appt-sem-uso")).toEqual({ ok: true, reversed: false });
    expect(store.packages[0]?.remaining).toBe(4);
  });
});

describe("cancelamento do pacote", () => {
  it("pending cancela package + financial pending de forma idempotente", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt());
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(cancelSoldPackage(store, sold.packageId)).toEqual({ ok: true, idempotent: false });
    expect(store.packages[0]?.operationalStatus).toBe("cancelled");
    expect(store.financialEntries[0]?.status).toBe("cancelled");
    expect(cancelSoldPackage(store, sold.packageId)).toEqual({ ok: true, idempotent: true });
  });

  it("paid sem uso bloqueia sem política de refund", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    expect(cancelSoldPackage(store, sold.packageId)).toEqual({
      ok: false,
      error: "package_paid_requires_refund",
    });
    expect(store.financialEntries[0]?.status).toBe("paid");
    expect(store.packages[0]?.operationalStatus).toBe("active");
  });

  it("paid com consumo bloqueia e preserva histórico", () => {
    const store = createLedgerStore();
    const sold = sellPackage(store, attempt({ financialStatus: "paid" }));
    if (!sold.ok) {
      throw new Error("expected sell");
    }

    consume(store, sold.packageId);
    expect(cancelSoldPackage(store, sold.packageId)).toEqual({
      ok: false,
      error: "package_has_usages",
    });
    expect(store.packages[0]?.usages).toHaveLength(1);
  });
});

describe("expiração civil inclusiva", () => {
  it("vence ontem, hoje e amanhã", () => {
    expect(isPackageExpiredOnCivilDate("2026-09-10", "2026-09-11")).toBe(true);
    expect(isPackageExpiredOnCivilDate("2026-09-11", "2026-09-11")).toBe(false);
    expect(isPackageExpiredOnCivilDate("2026-09-12", "2026-09-11")).toBe(false);
  });

  it("usa data civil do fuso da empresa, inclusive na virada e em DST", () => {
    const almostMidnightUtc = "2026-09-12T02:30:00.000Z";
    expect(formatUtcDateInTimezone(almostMidnightUtc, "America/Sao_Paulo")).toBe("2026-09-11");
    expect(formatUtcDateInTimezone(almostMidnightUtc, "UTC")).toBe("2026-09-12");

    const nyDst = "2026-03-08T06:30:00.000Z";
    expect(formatUtcDateInTimezone(nyDst, "America/New_York")).toBe("2026-03-08");
    expect(formatUtcDateInTimezone(nyDst, "UTC")).toBe("2026-03-08");

    const nyAfterDst = "2026-03-08T07:30:00.000Z";
    expect(formatUtcDateInTimezone(nyAfterDst, "America/New_York")).toBe("2026-03-08");
  });

  it("pacote que vence hoje ainda pode ser consumido; o de ontem não", () => {
    const store = createLedgerStore();
    const today = sellPackage(
      store,
      attempt({ financialStatus: "paid", expiresAt: "2026-09-11", idempotencyKey: KEY_A }),
    );
    const yesterday = sellPackage(
      store,
      attempt({ financialStatus: "paid", expiresAt: "2026-09-10", idempotencyKey: KEY_B }),
    );
    if (!today.ok || !yesterday.ok) {
      throw new Error("expected sell");
    }

    expect(consume(store, today.packageId, { today: "2026-09-11" }).ok).toBe(true);
    expect(consume(store, yesterday.packageId, { today: "2026-09-11" })).toEqual({
      ok: false,
      error: "package_expired",
    });
  });
});
