import { describe, expect, it } from "vitest";

import { SERVICE_ORDER_STATUS_LABELS } from "@/features/service-orders/status";
import type { ServiceOrderListItem } from "@/features/service-orders/types";
import {
  formatDashboardWhenLabel,
  getServiceOrderActivityAt,
  sortServiceOrdersByRecentActivity,
} from "@/features/service-orders/utils";

const TZ = "America/Sao_Paulo";

function order(partial: Partial<ServiceOrderListItem>): ServiceOrderListItem {
  return {
    id: partial.id ?? "order-1",
    appointment_id: "apt-1",
    status: partial.status ?? "waiting",
    check_in_at: partial.check_in_at ?? "2026-08-18T12:00:00.000Z",
    started_at: partial.started_at ?? null,
    ready_at: partial.ready_at ?? null,
    completed_at: partial.completed_at ?? null,
    intake_notes: null,
    internal_notes: null,
    completion_notes: null,
    created_at: "2026-08-18T12:00:00.000Z",
    updated_at: "2026-08-18T12:00:00.000Z",
    appointment: {
      id: "apt-1",
      scheduled_start: "2026-08-18T14:00:00.000Z",
      scheduled_end: "2026-08-18T15:00:00.000Z",
      status: "in_progress",
      service_name_snapshot: "Banho",
      price_cents_snapshot: 8000,
      duration_minutes_snapshot: 60,
      pet: { id: "pet-1", name: "Thor" },
      customer: { id: "cust-1", name: "Ana Silva", phone: "11999999999" },
      employee: { id: "emp-1", name: "João" },
      ...(partial.appointment ?? {}),
    },
    ...partial,
  };
}

describe("dashboard recent service orders helpers", () => {
  it("ordena do mais recente para o mais antigo", () => {
    const sorted = sortServiceOrdersByRecentActivity([
      order({ id: "old", check_in_at: "2026-08-10T12:00:00.000Z" }),
      order({ id: "new", completed_at: "2026-08-18T16:00:00.000Z" }),
    ]);

    expect(sorted[0]?.id).toBe("new");
    expect(sorted[1]?.id).toBe("old");
  });

  it("prioriza completed_at como atividade", () => {
    const activity = getServiceOrderActivityAt(
      order({
        completed_at: "2026-08-18T17:00:00.000Z",
        check_in_at: "2026-08-18T12:00:00.000Z",
      }),
    );

    expect(activity).toBe("2026-08-18T17:00:00.000Z");
  });

  it("formata hoje e ontem", () => {
    expect(
      formatDashboardWhenLabel("2026-08-18T17:00:00.000Z", TZ, "2026-08-18"),
    ).toMatch(/^Hoje,/);
    expect(
      formatDashboardWhenLabel("2026-08-17T17:00:00.000Z", TZ, "2026-08-18"),
    ).toMatch(/^Ontem,/);
  });

  it("traduz status existentes do projeto", () => {
    expect(SERVICE_ORDER_STATUS_LABELS.waiting).toBe("Aguardando");
    expect(SERVICE_ORDER_STATUS_LABELS.in_progress).toBe("Em atendimento");
    expect(SERVICE_ORDER_STATUS_LABELS.ready).toBe("Pronto para buscar");
    expect(SERVICE_ORDER_STATUS_LABELS.completed).toBe("Finalizado");
    expect(SERVICE_ORDER_STATUS_LABELS.cancelled).toBe("Cancelado");
  });
});
