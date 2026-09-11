import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  interpretServiceOrderMutation,
  parseServiceOrderMutationRpc,
  shouldEmitServiceOrderSideEffects,
} from "@/features/service-orders/mutation-result";
import {
  ServiceOrderOperationalStore,
  createStaffActor,
} from "@/features/service-orders/operational-engine";
import { ALLOWED_SERVICE_ORDER_TRANSITIONS } from "@/features/service-orders/status";
import { assertPermissionForAction } from "@/lib/auth/require-permission";
import {
  getProfilePermissions,
  type MembershipAccess,
} from "@/lib/auth/permissions";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const BLOCO3 = join(
  process.cwd(),
  "supabase/migrations/20260911180000_service_order_state_machine_concurrency.sql",
);
const BLOCO1 = join(
  process.cwd(),
  "supabase/migrations/20260911120000_authorization_rls_tenant_isolation.sql",
);
const BLOCO2 = join(
  process.cwd(),
  "supabase/migrations/20260911153000_agenda_civil_date_working_hours_recurrence.sql",
);

function sql() {
  return readFileSync(BLOCO3, "utf8");
}

function appointment(
  store: ServiceOrderOperationalStore,
  id: string,
  status: "scheduled" | "confirmed" | "in_progress" | "cancelled" | "no_show" | "completed" = "scheduled",
  companyId = COMPANY_A,
) {
  store.addAppointment({
    id,
    companyId,
    status,
    deletedAt: null,
  });
}

function membership(
  overrides: Partial<MembershipAccess> & Pick<MembershipAccess, "role">,
): MembershipAccess {
  return {
    accessProfile: overrides.accessProfile ?? null,
    permissions: overrides.permissions ?? [],
    accessRevokedAt: overrides.accessRevokedAt ?? null,
    employeeId: overrides.employeeId ?? null,
    ownScheduleOnly: overrides.ownScheduleOnly ?? false,
    role: overrides.role,
  };
}

function ctx(m: MembershipAccess, companyId = COMPANY_A) {
  return {
    user: { id: "u1", email: "test@test.com" },
    profile: { fullName: "Test", avatarUrl: null, onboardingTutorialCompletedAt: null },
    membership: { ...m, company: { id: companyId, name: "TestCo", timezone: "America/Sao_Paulo" } },
  };
}

describe("BLOCO 3 — check-in", () => {
  it("1. appointment válido cria UMA OS", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const result = store.checkIn(actor, "a1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changed).toBe(true);
      expect(store.ordersByAppointment.size).toBe(1);
      expect(store.appointments.get("a1")?.status).toBe("confirmed");
    }
  });

  it("2. segundo check-in sequencial retorna a mesma OS", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const first = store.checkIn(actor, "a1");
    const second = store.checkIn(actor, "a1");
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.serviceOrderId).toBe(first.value.serviceOrderId);
      expect(second.idempotent).toBe(true);
      expect(store.ordersByAppointment.size).toBe(1);
    }
  });

  it("3. duas chamadas concorrentes geram a mesma OS sem unique_violation", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const raced = store.checkInConcurrent(actor, "a1", "on-conflict");
    expect(raced.distinctOrderIds).toBe(1);
    expect(raced.first.uniqueViolationExposed).toBe(false);
    expect(raced.second.uniqueViolationExposed).toBe(false);
    expect(raced.first.ok && raced.second.ok).toBe(true);
    if (raced.first.ok && raced.second.ok) {
      expect(raced.second.value.serviceOrderId).toBe(raced.first.value.serviceOrderId);
    }
  });

  it("3b. o padrão legado SELECT+INSERT expõe unique_violation — e foi substituído", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const legacy = store.checkInConcurrent(actor, "a1", "legacy-select-insert");
    expect(legacy.second.uniqueViolationExposed).toBe(true);
    expect(sql()).toContain("ON CONFLICT (appointment_id) DO NOTHING");
    expect(sql()).toContain("WHEN unique_violation THEN");
  });

  it("4. retry após timeout retorna a mesma OS", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const first = store.checkIn(actor, "a1");
    const timeoutRetry = store.checkIn(actor, "a1");
    expect(first.ok && timeoutRetry.ok).toBe(true);
    if (first.ok && timeoutRetry.ok) {
      expect(timeoutRetry.value.serviceOrderId).toBe(first.value.serviceOrderId);
      expect(timeoutRetry.idempotent).toBe(true);
      expect(store.effects.consumptionSeeds).toBe(1);
      expect(store.effects.packageLinks).toBe(1);
    }
  });

  it("5. appointment cancelled rejeita check-in", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1", "cancelled");
    const result = store.checkIn(createStaffActor(COMPANY_A), "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("appointment_not_eligible");
  });

  it("6. appointment no_show rejeita check-in", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1", "no_show");
    const result = store.checkIn(createStaffActor(COMPANY_A), "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("appointment_not_eligible");
  });

  it("7. appointment de outra empresa é not_found sem vazar existência", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1", "scheduled", COMPANY_B);
    const result = store.checkIn(createStaffActor(COMPANY_A), "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("appointment_not_found");
  });

  it("8. staff sem permissão é rejeitado", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const result = store.checkIn(
      createStaffActor(COMPANY_A, { hasUpdateStatusPermission: false }),
      "a1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("company_membership_required");
  });

  it("9. staff revogado é rejeitado", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const result = store.checkIn(
      createStaffActor(COMPANY_A, { accessRevokedAt: "2026-09-11T00:00:00.000Z" }),
      "a1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("company_membership_required");
  });

  it("OS cancelada não é devolvida como ativa", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    expect(created.ok).toBe(true);
    if (created.ok) {
      const cancelled = store.cancel(actor, created.value.serviceOrderId);
      expect(cancelled.ok).toBe(true);
      const retry = store.checkIn(actor, "a1");
      expect(retry.ok).toBe(false);
      if (!retry.ok) expect(retry.error).toBe("service_order_cancelled");
    }
  });
});

describe("BLOCO 3 — máquina de estados", () => {
  it("waiting → in_progress → ready → completed", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const checkIn = store.checkIn(actor, "a1");
    expect(checkIn.ok).toBe(true);
    if (!checkIn.ok) return;
    const id = checkIn.value.serviceOrderId;
    expect(store.start(actor, id).ok).toBe(true);
    expect(store.markReady(actor, id).ok).toBe(true);
    expect(store.complete(actor, id).ok).toBe(true);
    expect(store.ordersById.get(id)?.status).toBe("completed");
    expect(store.timestampsAreCoherent(id)).toBe(true);
  });

  it("rejeita transições inválidas de forma controlada", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const checkIn = store.checkIn(actor, "a1");
    expect(checkIn.ok).toBe(true);
    if (!checkIn.ok) return;
    const id = checkIn.value.serviceOrderId;

    expect(store.complete(actor, id).ok).toBe(false);
    store.start(actor, id);
    store.markReady(actor, id);
    store.complete(actor, id);
    expect(store.start(actor, id).ok).toBe(false);
    expect(store.cancel(actor, id).ok).toBe(false);

    const cancelledStore = new ServiceOrderOperationalStore();
    appointment(cancelledStore, "a2");
    const created = cancelledStore.checkIn(actor, "a2");
    if (created.ok) {
      cancelledStore.cancel(actor, created.value.serviceOrderId);
      expect(cancelledStore.markReady(actor, created.value.serviceOrderId).ok).toBe(false);
    }
  });

  it("definição TS e SQL da máquina coincidem", () => {
    expect(ALLOWED_SERVICE_ORDER_TRANSITIONS.waiting).toEqual(["in_progress", "cancelled"]);
    expect(ALLOWED_SERVICE_ORDER_TRANSITIONS.in_progress).toEqual(["ready"]);
    expect(ALLOWED_SERVICE_ORDER_TRANSITIONS.ready).toEqual(["completed"]);
    expect(ALLOWED_SERVICE_ORDER_TRANSITIONS.completed).toEqual([]);
    expect(ALLOWED_SERVICE_ORDER_TRANSITIONS.cancelled).toEqual([]);
    const migration = sql();
    expect(migration).toContain("WHEN 'waiting' THEN p_to IN ('in_progress', 'cancelled')");
    expect(migration).toContain("WHEN 'in_progress' THEN p_to = 'ready'");
    expect(migration).toContain("WHEN 'ready' THEN p_to = 'completed'");
  });
});

describe("BLOCO 3 — concorrência de transições", () => {
  it("duas abas iniciando: só uma transição real", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.serviceOrderId;
    const [first, second] = store.race([
      () => store.start(actor, id),
      () => store.start(actor, id),
    ]);
    expect(first.ok && second.ok).toBe(true);
    const applied = [first, second].filter((item) => item.ok && item.changed);
    const idempotent = [first, second].filter((item) => item.ok && item.idempotent);
    expect(applied).toHaveLength(1);
    expect(idempotent).toHaveLength(1);
    expect(store.ordersById.get(id)?.status).toBe("in_progress");
    expect(store.ordersById.get(id)?.startedAt).toBe(store.nowIso);
  });

  it("ready vs cancel a partir de in_progress: só ready ganha", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    store.start(actor, created.value.serviceOrderId);
    const ready = store.markReady(actor, created.value.serviceOrderId);
    const cancel = store.cancel(actor, created.value.serviceOrderId);
    expect(ready.ok && ready.changed).toBe(true);
    expect(cancel.ok).toBe(false);
    expect(store.ordersById.get(created.value.serviceOrderId)?.status).toBe("ready");
  });

  it("completed vs cancel: estado final consistente", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    const id = created.value.serviceOrderId;
    store.start(actor, id);
    store.markReady(actor, id);
    store.complete(actor, id);
    const cancel = store.cancel(actor, id);
    expect(cancel.ok).toBe(false);
    expect(store.ordersById.get(id)?.status).toBe("completed");
  });
});

describe("BLOCO 3 — cancelamento", () => {
  it("cancela OS waiting e sincroniza appointment", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    const result = store.cancel(actor, created.value.serviceOrderId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
      expect(result.value.appointmentStatus).toBe("cancelled");
    }
    expect(store.ordersById.get(created.value.serviceOrderId)?.cancelledAt).toBe(store.nowIso);
  });

  it("não cancela in_progress nem ready", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    store.start(actor, created.value.serviceOrderId);
    expect(store.cancel(actor, created.value.serviceOrderId).ok).toBe(false);
    store.markReady(actor, created.value.serviceOrderId);
    expect(store.cancel(actor, created.value.serviceOrderId).ok).toBe(false);
  });

  it("retry e cancelar duas vezes são idempotentes", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    const first = store.cancel(actor, created.value.serviceOrderId);
    const writesAfterCancel = store.effects.appointmentStatusWrites;
    const retry = store.cancel(actor, created.value.serviceOrderId);
    expect(first.ok && first.changed).toBe(true);
    expect(retry.ok && retry.idempotent).toBe(true);
    expect(store.effects.appointmentStatusWrites).toBe(writesAfterCancel);
  });

  it("novo check-in após cancelamento não reabre a OS", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    if (!created.ok) return;
    store.cancel(actor, created.value.serviceOrderId);
    const again = store.checkIn(actor, "a1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("service_order_cancelled");
    expect(store.appointments.get("a1")?.status).toBe("cancelled");
  });
});

describe("BLOCO 3 — efeitos derivados uma única vez", () => {
  it("double click / retry / duas abas não duplicam consumos, receita, notificação", () => {
    const store = new ServiceOrderOperationalStore();
    appointment(store, "a1");
    const actor = createStaffActor(COMPANY_A);
    const created = store.checkIn(actor, "a1");
    store.checkIn(actor, "a1");
    if (!created.ok) return;
    const id = created.value.serviceOrderId;
    store.start(actor, id);
    store.start(actor, id);
    store.markReady(actor, id);
    store.markReady(actor, id);

    expect(store.effects.consumptionSeeds).toBe(1);
    expect(store.effects.packageLinks).toBe(1);
    expect(store.effects.stockMovements).toBe(1);
    expect(store.effects.financialEntries).toBe(1);
    expect(store.effects.notifications).toBe(1);
    expect(store.timestampsAreCoherent(id)).toBe(true);
  });

  it("jsonb changed=false não dispara efeito na action", () => {
    const applied = interpretServiceOrderMutation({
      rpc: { id: "so-1", status: "ready", changed: true, idempotent: false },
    });
    const retry = interpretServiceOrderMutation({
      rpc: { id: "so-1", status: "ready", changed: false, idempotent: true },
    });
    expect(shouldEmitServiceOrderSideEffects(applied)).toBe(true);
    expect(shouldEmitServiceOrderSideEffects(retry)).toBe(false);
  });

  it("parser aceita uuid legado e jsonb", () => {
    expect(parseServiceOrderMutationRpc("so-uuid")?.id).toBe("so-uuid");
    expect(
      parseServiceOrderMutationRpc({
        id: "so-json",
        status: "waiting",
        changed: false,
        idempotent: true,
      })?.idempotent,
    ).toBe(true);
  });
});

describe("BLOCO 3 — SQL e permissões", () => {
  it("migration incremental usa lock, ON CONFLICT, CAS e cancelled_at", () => {
    const migration = sql();
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancelled_at timestamptz");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("ON CONFLICT (appointment_id) DO NOTHING");
    expect(migration).toContain("AND status = 'waiting'");
    expect(migration).toContain("AND status = 'in_progress'");
    expect(migration).toContain("AND status = 'ready'");
    expect(migration).toContain("service_order_cancelled");
    expect(migration).toContain("COALESCE(cancelled_at, now())");
    expect(migration).toContain("COALESCE(started_at, now())");
    expect(migration).toContain("COALESCE(ready_at, now())");
    expect(migration).toContain("COALESCE(completed_at, now())");
    expect(migration).toContain("WHEN unique_violation THEN");
    expect(migration).toContain("private.activate_company_context(p_company_id)");
    expect(migration).toContain("private.require_app_permission(p_company_id, 'service_orders.update_status')");
    expect(migration).toContain("a.company_id = v_company_id");
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation.sql");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence.sql");
  });

  it("não reedita migrations dos BLOCOS 1 e 2", () => {
    const bloco1 = readFileSync(BLOCO1, "utf8");
    const bloco2 = readFileSync(BLOCO2, "utf8");
    expect(bloco1).toContain("private.require_app_permission");
    expect(bloco2).toContain("private.transition_appointment_status");
    expect(bloco2).toContain("break_start");
  });

  it("actions continuam com tenant explícito e permissão mínima", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/service-orders/actions.ts"),
      "utf8",
    );
    expect(source).toContain('requirePermission("service_orders.update_status")');
    expect(source).toContain("p_company_id: context.membership.company.id");
    expect(source).toContain("shouldEmitServiceOrderSideEffects");
    expect(source).not.toMatch(/await requireCompanyContext\(\)/);
  });

  it("staff sem permissão e staff revogado são negados na action", () => {
    const finance = membership({
      role: "staff",
      accessProfile: "finance",
      permissions: getProfilePermissions("finance"),
    });
    const revoked = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
      accessRevokedAt: "2026-09-11T00:00:00.000Z",
    });
    const operational = membership({
      role: "staff",
      accessProfile: "operational",
      permissions: getProfilePermissions("operational"),
    });

    expect(assertPermissionForAction(ctx(finance), "service_orders.update_status")?.error).toMatch(
      /permissão/i,
    );
    expect(assertPermissionForAction(ctx(revoked), "service_orders.update_status")?.error).toMatch(
      /removido/i,
    );
    expect(assertPermissionForAction(ctx(operational), "service_orders.update_status")).toBeNull();
  });
});
