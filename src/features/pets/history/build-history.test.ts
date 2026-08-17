import { describe, expect, it } from "vitest";

import {
  buildEventsFromAppointment,
  buildPetHistoryEvents,
  buildPetHistorySummary,
  computeTopService,
  filterPetHistoryEvents,
} from "@/features/pets/history/build-history";
import type { AppointmentHistoryRow } from "@/features/pets/history/types";
import { PET_HISTORY_PAGE_SIZE } from "@/features/pets/history/types";

function makeAppointment(
  overrides: Partial<AppointmentHistoryRow> & Pick<AppointmentHistoryRow, "id" | "scheduled_start">,
): AppointmentHistoryRow {
  return {
    created_at: "2026-01-01T10:00:00.000Z",
    scheduled_end: "2026-01-01T11:00:00.000Z",
    status: "scheduled",
    service_name_snapshot: "Banho",
    price_cents_snapshot: 8000,
    notes: null,
    cancellation_reason: null,
    employee_name: "Ana",
    service_order: null,
    financial_entry: null,
    package_usage: null,
    ...overrides,
  };
}

describe("buildPetHistoryEvents", () => {
  it("retorna vazio para pet sem histórico", () => {
    expect(buildPetHistoryEvents([])).toEqual([]);
  });

  it("ordena eventos do mais recente para o mais antigo", () => {
    const rows = [
      makeAppointment({
        id: "a1",
        scheduled_start: "2026-01-01T12:00:00.000Z",
        created_at: "2025-12-20T10:00:00.000Z",
      }),
      makeAppointment({
        id: "a2",
        scheduled_start: "2026-02-01T12:00:00.000Z",
        created_at: "2026-01-25T10:00:00.000Z",
      }),
    ];

    const events = buildPetHistoryEvents(rows);

    expect(events[0]?.appointmentId).toBe("a2");
    expect(events.at(-1)?.appointmentId).toBe("a1");
    expect(
      new Date(events[0]!.occurredAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(events[1]!.occurredAt).getTime());
  });

  it("gera eventos de cancelamento e no-show", () => {
    const cancelled = buildEventsFromAppointment(
      makeAppointment({
        id: "c1",
        scheduled_start: "2026-03-01T14:00:00.000Z",
        status: "cancelled",
        cancellation_reason: "Cliente desistiu",
      }),
    );
    const noShow = buildEventsFromAppointment(
      makeAppointment({
        id: "n1",
        scheduled_start: "2026-03-02T14:00:00.000Z",
        status: "no_show",
      }),
    );

    expect(cancelled.some((event) => event.title === "Agendamento cancelado")).toBe(true);
    expect(noShow.some((event) => event.title === "Não compareceu")).toBe(true);
  });

  it("gera eventos de atendimento e financeiro", () => {
    const events = buildEventsFromAppointment(
      makeAppointment({
        id: "s1",
        scheduled_start: "2026-04-01T14:00:00.000Z",
        status: "completed",
        service_order: {
          id: "so1",
          status: "completed",
          check_in_at: "2026-04-01T13:55:00.000Z",
          started_at: "2026-04-01T14:00:00.000Z",
          ready_at: "2026-04-01T15:00:00.000Z",
          completed_at: "2026-04-01T15:10:00.000Z",
          intake_notes: "Pet calmo",
          internal_notes: null,
          completion_notes: "Finalizado sem intercorrências",
        },
        financial_entry: {
          id: "fe1",
          status: "paid",
          amount_cents: 8000,
          payment_method: "pix",
          paid_at: "2026-04-01T15:15:00.000Z",
        },
      }),
    );

    expect(events.some((event) => event.title === "Atendimento iniciado")).toBe(true);
    expect(events.some((event) => event.title === "Atendimento concluído")).toBe(true);
    expect(events.some((event) => event.title === "Pagamento registrado")).toBe(true);
  });
});

describe("filterPetHistoryEvents", () => {
  const events = buildPetHistoryEvents([
    makeAppointment({
      id: "f1",
      scheduled_start: "2026-05-01T10:00:00.000Z",
      status: "cancelled",
    }),
    makeAppointment({
      id: "f2",
      scheduled_start: "2026-05-02T10:00:00.000Z",
      status: "completed",
      service_order: {
        id: "so2",
        status: "completed",
        check_in_at: "2026-05-02T09:55:00.000Z",
        started_at: "2026-05-02T10:00:00.000Z",
        ready_at: "2026-05-02T11:00:00.000Z",
        completed_at: "2026-05-02T11:05:00.000Z",
        intake_notes: null,
        internal_notes: null,
        completion_notes: null,
      },
      financial_entry: {
        id: "fe2",
        status: "paid",
        amount_cents: 5000,
        payment_method: "cash",
        paid_at: "2026-05-02T11:10:00.000Z",
      },
    }),
  ]);

  it("filtra atendimentos", () => {
    const filtered = filterPetHistoryEvents(events, "services");
    expect(filtered.every((event) => event.filterTags.includes("services"))).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("filtra financeiro", () => {
    const filtered = filterPetHistoryEvents(events, "financial");
    expect(filtered.every((event) => event.filterTags.includes("financial"))).toBe(true);
  });

  it("filtra cancelamentos e faltas", () => {
    const filtered = filterPetHistoryEvents(events, "cancellations");
    expect(filtered.some((event) => event.title.includes("cancelado"))).toBe(true);
  });

  it("retorna todos com filtro all", () => {
    expect(filterPetHistoryEvents(events, "all")).toHaveLength(events.length);
  });
});

describe("buildPetHistorySummary", () => {
  const nowIso = "2026-06-15T12:00:00.000Z";

  it("calcula resumo com estados vazios", () => {
    expect(
      buildPetHistorySummary({
        appointments: [],
        completedServiceCount: 0,
        totalSpentCents: 0,
        nowIso,
      }),
    ).toEqual({
      lastServiceAt: null,
      lastServiceName: null,
      nextAppointmentAt: null,
      nextAppointmentServiceName: null,
      totalAppointments: 0,
      totalCompletedServices: 0,
      totalSpentCents: 0,
      topServiceName: null,
      topServiceCount: 0,
    });
  });

  it("calcula último atendimento, próximo agendamento e totais", () => {
    const summary = buildPetHistorySummary({
      appointments: [
        {
          scheduled_start: "2026-06-01T10:00:00.000Z",
          status: "completed",
          service_name_snapshot: "Banho",
        },
        {
          scheduled_start: "2026-06-20T10:00:00.000Z",
          status: "scheduled",
          service_name_snapshot: "Tosa",
        },
        {
          scheduled_start: "2026-05-01T10:00:00.000Z",
          status: "completed",
          service_name_snapshot: "Banho",
        },
      ],
      completedServiceCount: 2,
      totalSpentCents: 15000,
      nowIso,
    });

    expect(summary.lastServiceAt).toBe("2026-06-01T10:00:00.000Z");
    expect(summary.lastServiceName).toBe("Banho");
    expect(summary.nextAppointmentAt).toBe("2026-06-20T10:00:00.000Z");
    expect(summary.nextAppointmentServiceName).toBe("Tosa");
    expect(summary.totalAppointments).toBe(3);
    expect(summary.totalCompletedServices).toBe(2);
    expect(summary.totalSpentCents).toBe(15000);
  });

  it("identifica serviço mais realizado", () => {
    const top = computeTopService([
      { service_name_snapshot: "Banho", status: "completed" },
      { service_name_snapshot: "Banho", status: "completed" },
      { service_name_snapshot: "Tosa", status: "completed" },
      { service_name_snapshot: "Tosa", status: "cancelled" },
    ]);

    expect(top).toEqual({ name: "Banho", count: 2 });
  });
});

describe("parsePetHistoryFilter", () => {
  it("valida filtros conhecidos", async () => {
    const { parsePetHistoryFilter } = await import("@/features/pets/history/types");

    expect(parsePetHistoryFilter("services")).toBe("services");
    expect(parsePetHistoryFilter("invalid")).toBe("all");
  });
});

describe("paginação do histórico", () => {
  it("usa tamanho de página fixo para carregar mais", () => {
    expect(PET_HISTORY_PAGE_SIZE).toBe(10);

    const totalAppointments = 25;
    const throughPage = 2;
    const hasMore = throughPage * PET_HISTORY_PAGE_SIZE < totalAppointments;

    expect(hasMore).toBe(true);
  });
});

describe("isolamento multi-tenant (queries)", () => {
  it("retorna vazio para ids inválidos", async () => {
    const { getPetHistoryPage, getPetHistorySummary } = await import(
      "@/features/pets/history/queries"
    );

    await expect(getPetHistoryPage("invalid", "invalid")).resolves.toEqual({
      events: [],
      page: 1,
      pageSize: PET_HISTORY_PAGE_SIZE,
      hasMore: false,
      totalAppointments: 0,
    });

    await expect(getPetHistorySummary("invalid", "invalid")).resolves.toEqual({
      lastServiceAt: null,
      lastServiceName: null,
      nextAppointmentAt: null,
      nextAppointmentServiceName: null,
      totalAppointments: 0,
      totalCompletedServices: 0,
      totalSpentCents: 0,
      topServiceName: null,
      topServiceCount: 0,
    });
  });
});

describe("petImportantInfoSchema", () => {
  it("valida informações importantes", async () => {
    const { petImportantInfoSchema } = await import("@/features/pets/schemas");

    const parsed = petImportantInfoSchema.safeParse({
      allergies: "Shampoo com perfume",
      importantNotes: "Medo de secador",
    });

    expect(parsed.success).toBe(true);
  });
});
