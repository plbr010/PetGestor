import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyConcurrentManualCreates,
  createEmptyManualLedger,
  createManualFinancialEntry,
  type CreateManualActor,
  type CreateManualInput,
} from "@/features/finance/create-manual-entry";
import { receivedCents, remainingCents } from "@/features/finance/ledger";
import { computeFinancialSummary } from "@/features/finance/utils";
import { getProfilePermissions, hasPermission } from "@/lib/auth/permissions";
import { computeOverview } from "@/features/reports/engine";
import type { FinancialEntryListItem } from "@/features/finance/types";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const KEY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MIGRATION = "supabase/migrations/20260911230000_create_manual_financial_entry_atomic.sql";
const PERIOD = { from: "2026-09-01", to: "2026-09-30", preset: "month" };

const owner: CreateManualActor = {
  companyId: COMPANY_A,
  hasFinanceCreate: true,
  accessRevokedAt: null,
};

function paidPix(overrides: Partial<CreateManualInput> = {}): CreateManualInput {
  return {
    companyId: COMPANY_A,
    entryType: "income",
    description: "Venda avulsa",
    category: "Venda avulsa",
    amountCents: 10000,
    dueDate: "2026-09-11",
    notes: null,
    desiredStatus: "paid",
    paymentMethod: "pix",
    paidAt: "2026-09-11T15:00:00.000Z",
    idempotencyKey: KEY_A,
    ...overrides,
  };
}

function pendingManual(overrides: Partial<CreateManualInput> = {}): CreateManualInput {
  return paidPix({
    desiredStatus: "pending",
    paymentMethod: null,
    paidAt: null,
    ...overrides,
  });
}

function toListItem(store: ReturnType<typeof createEmptyManualLedger>): FinancialEntryListItem[] {
  return store.entries.map((entry) => {
    const payments = store.payments.filter((payment) => payment.entryId === entry.id);
    const snapshot = {
      amountCents: entry.amountCents,
      status: entry.status,
      payments,
    };

    return {
      id: entry.id,
      entry_type: entry.entryType ?? "income",
      status: entry.status,
      source_type: entry.sourceType,
      service_order_id: null,
      description: entry.description ?? "Venda avulsa",
      category: entry.category ?? null,
      amount_cents: entry.amountCents,
      received_cents: receivedCents(snapshot),
      remaining_cents: remainingCents(snapshot),
      due_date: entry.dueDate ?? null,
      paid_at: entry.paidAt,
      payment_method: entry.paymentMethod,
      notes: entry.notes ?? null,
      created_at: "2026-09-11T15:00:00.000Z",
      updated_at: "2026-09-11T15:00:00.000Z",
      cancelled_at: null,
      payments: payments.map((payment) => ({
        id: payment.id,
        amount_cents: payment.amountCents,
        payment_method: payment.paymentMethod,
        paid_at: payment.paidAt,
        cancelled_at: payment.cancelledAt ?? null,
      })),
      service_order: null,
    };
  });
}

describe("BLOCO 5 hardening — criação manual atômica", () => {
  it("1) criar manual pending → 1 entry pending e 0 payments", () => {
    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(store, owner, pendingManual());

    expect(result).toEqual({ ok: true, entryId: expect.any(String), created: true });
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]?.status).toBe("pending");
    expect(store.payments).toHaveLength(0);
  });

  it("2) criar manual paid R$100 Pix → 1 entry paid e 1 payment R$100 Pix", () => {
    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(store, owner, paidPix());

    expect(result.ok).toBe(true);
    expect(store.entries).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.entries[0]?.status).toBe("paid");
    expect(store.entries[0]?.paymentMethod).toBe("pix");
    expect(store.payments[0]?.amountCents).toBe(10000);
    expect(store.payments[0]?.paymentMethod).toBe("pix");
    expect(store.payments[0]?.idempotencyKey).toBe(`manual-create:${KEY_A}`);
  });

  it("3) falha ao criar payment → 0 entry e 0 payment persistidos", () => {
    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(store, owner, paidPix(), { failPayment: true });

    expect(result).toEqual({ ok: false, error: "payment_failed" });
    expect(store.entries).toHaveLength(0);
    expect(store.payments).toHaveLength(0);
  });

  it("4) retry com a mesma idempotency_key → continua 1 entry + 1 payment", () => {
    const store = createEmptyManualLedger();
    const first = createManualFinancialEntry(store, owner, paidPix());
    const retry = createManualFinancialEntry(store, owner, paidPix());

    expect(first.ok).toBe(true);
    expect(retry).toEqual({ ok: true, entryId: first.ok ? first.entryId : "", created: false });
    expect(store.entries).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
  });

  it("5) duas chamadas concorrentes com a mesma chave → 1 entry + 1 payment", () => {
    const store = createEmptyManualLedger();
    const { first, second } = applyConcurrentManualCreates(store, owner, paidPix());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.entryId).toBe(first.entryId);
      expect(second.created).toBe(false);
    }
    expect(store.entries).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
  });

  it("6) mesma chave com payload diferente → idempotency_key_conflict", () => {
    const store = createEmptyManualLedger();
    createManualFinancialEntry(store, owner, paidPix());
    const conflict = createManualFinancialEntry(
      store,
      owner,
      paidPix({ amountCents: 5000, paymentMethod: "cash" }),
    );

    expect(conflict).toEqual({ ok: false, error: "idempotency_key_conflict" });
    expect(store.entries).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]?.amountCents).toBe(10000);
  });

  it("7) cross-tenant → negado", () => {
    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(
      store,
      owner,
      paidPix({ companyId: COMPANY_B }),
    );

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(store.entries).toHaveLength(0);
    expect(store.payments).toHaveLength(0);
  });

  it("8) staff sem finance.create → negado", () => {
    const operational = getProfilePermissions("operational");
    expect(hasPermission(
      {
        role: "staff",
        accessProfile: "operational",
        permissions: operational,
        accessRevokedAt: null,
        employeeId: "emp-1",
        ownScheduleOnly: false,
      },
      "finance.create",
    )).toBe(false);

    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(
      store,
      { companyId: COMPANY_A, hasFinanceCreate: false, accessRevokedAt: null },
      paidPix(),
    );

    expect(result).toEqual({ ok: false, error: "permission_denied" });
    expect(store.entries).toHaveLength(0);
  });

  it("9) staff revogado → negado", () => {
    const store = createEmptyManualLedger();
    const result = createManualFinancialEntry(
      store,
      {
        companyId: COMPANY_A,
        hasFinanceCreate: true,
        accessRevokedAt: "2026-09-11T00:00:00.000Z",
      },
      paidPix(),
    );

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(store.entries).toHaveLength(0);
  });

  it("10) lançamento manual paid aparece no Financeiro, Dashboard e Overview", () => {
    const store = createEmptyManualLedger();
    createManualFinancialEntry(store, owner, paidPix());
    const entries = toListItem(store);
    const summary = computeFinancialSummary(entries);
    const overview = computeOverview(
      {
        revenueCents: 0,
        incomeReceivedCents: summary.incomePaidCents,
        expensePaidCents: summary.expensePaidCents,
        appointmentsCount: 0,
        salesCount: 0,
        newCustomersCount: 0,
        cancellationsCount: 0,
        noShowCount: 0,
      },
      null,
      PERIOD,
      null,
    );

    expect(summary.incomePaidCents).toBe(10000);
    expect(summary.incomePendingCents).toBe(0);
    expect(summary.realizedResultCents).toBe(10000);
    expect(overview.incomeReceivedCents).toBe(10000);
    expect(overview.netResultCents).toBe(10000);
    expect(entries[0]?.payments).toHaveLength(1);
  });

  it("chave nova cria um segundo lançamento intencional", () => {
    const store = createEmptyManualLedger();
    createManualFinancialEntry(store, owner, paidPix());
    const second = createManualFinancialEntry(store, owner, paidPix({ idempotencyKey: KEY_B }));

    expect(second.ok).toBe(true);
    expect(store.entries).toHaveLength(2);
    expect(store.payments).toHaveLength(2);
  });
});

describe("BLOCO 5 hardening — superfície SQL da criação atômica", () => {
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("não reaplica blocos anteriores nem inicia PDV", () => {
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(migration).not.toContain("20260911180000_service_order_state_machine_concurrency");
    expect(migration).not.toContain("20260911200000_customer_service_packages_payment_idempotency");
    expect(migration).not.toContain("20260911220000_financial_payments_source_of_truth");
    expect(migration).not.toContain("register_sale_payment");
    expect(migration).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/DELETE FROM public\.financial_payments/i);
  });

  it("RPC única com tenant, membership ativa e finance.create", () => {
    expect(migration).toContain("private.create_manual_financial_entry");
    expect(migration).toContain("public.create_manual_financial_entry");
    expect(migration).toContain("PERFORM private.activate_company_context(p_company_id)");
    expect(migration).toContain("PERFORM private.require_app_permission(p_company_id, 'finance.create')");
    expect(migration).toContain("private.is_company_member(v_company_id)");
    expect(migration).toContain("p_company_id uuid DEFAULT NULL");
    expect(migration).toContain("p_desired_status");
    expect(migration).toContain("p_idempotency_key");
  });

  it("paid cria payment na mesma função; falha não é engolida", () => {
    const fn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION private.create_manual_financial_entry("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.create_manual_financial_entry("),
    );

    expect(fn).toContain("status,\n      source_type");
    expect(fn).toContain("'pending'");
    expect(fn).toContain("private.register_financial_payment");
    expect(fn).toContain("'manual-create:' || v_key");
    expect(fn).toContain("Sem EXCEPTION aqui");
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("WHEN unique_violation THEN");
    expect(fn).not.toContain("mark_financial_entry_paid");
  });

  it("índice único por empresa na chave de criação", () => {
    expect(migration).toContain("financial_entries_company_idempotency_key_uidx");
    expect(migration).toContain("ON public.financial_entries (company_id, idempotency_key)");
    expect(migration).toContain("idempotency_key_conflict");
  });
});

describe("BLOCO 5 hardening — Server Action não faz duas transações", () => {
  it("createManualEntry chama só create_manual_financial_entry", () => {
    const source = readFileSync(join(process.cwd(), "src/features/finance/actions.ts"), "utf8");
    const fn = source.slice(
      source.indexOf("async function createManualEntry"),
      source.indexOf("export async function createManualFinancialEntryAction"),
    );

    expect(fn).toContain('rpc("create_manual_financial_entry"');
    expect(fn).toContain("p_company_id: context.membership.company.id");
    expect(fn).toContain("p_idempotency_key");
    expect(fn).toContain("p_desired_status");
    expect(fn).not.toContain(".from(\"financial_entries\")");
    expect(fn).not.toContain("mark_financial_entry_paid");
    expect(fn).not.toContain(".insert(");
  });

  it("Dashboard e Overview continuam somando financial_payments", () => {
    const financeQueries = readFileSync(
      join(process.cwd(), "src/features/finance/queries.ts"),
      "utf8",
    );
    const reportsQueries = readFileSync(
      join(process.cwd(), "src/features/reports/queries.ts"),
      "utf8",
    );

    expect(financeQueries).toContain("sumReceivedForEntryType(companyId, \"income\", today, today");
    expect(financeQueries).toContain("getMonthlyFinancialSummary");
    expect(reportsQueries).toContain("sumReceivedForEntryType");
    expect(reportsQueries).toContain("incomeReceivedCents");
  });
});
