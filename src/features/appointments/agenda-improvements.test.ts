import { describe, expect, it } from "vitest";

import {
  buildDuplicatePrefill,
  buildSlotPrefill,
  countMatchingWaitlistEntries,
  formatWaitlistPreference,
  hourToWaitlistPeriod,
  isRangeBlockedByTimeBlocks,
  matchesCancelledSlot,
  slotTimeFromClick,
} from "@/features/appointments/waitlist/utils";
import { waitlistFormSchema } from "@/features/appointments/waitlist/schemas";
import { timeBlockFormSchema } from "@/features/appointments/time-blocks/schemas";

describe("slotTimeFromClick", () => {
  it("preenche horário ao clicar em slot", () => {
    expect(slotTimeFromClick(9, 0)).toBe("09:00");
    expect(slotTimeFromClick(14, 2)).toBe("14:30");
  });
});

describe("buildSlotPrefill", () => {
  it("monta prefill de data e hora", () => {
    expect(buildSlotPrefill("2026-08-20", "10:15", "emp-1")).toEqual({
      date: "2026-08-20",
      time: "10:15",
      employeeId: "emp-1",
    });
  });
});

describe("buildDuplicatePrefill", () => {
  it("copia dados do agendamento exceto data/hora", () => {
    expect(
      buildDuplicatePrefill({
        customerId: "c1",
        petId: "p1",
        serviceId: "s1",
        employeeId: "e1",
        petSize: "medium",
        notes: "Pet calmo",
      }),
    ).toEqual({
      customerId: "c1",
      petId: "p1",
      serviceId: "s1",
      employeeId: "e1",
      petSize: "medium",
      notes: "Pet calmo",
    });
  });
});

describe("matchesCancelledSlot", () => {
  const slot = {
    service_id: "service-1",
    employee_id: "employee-1",
    scheduled_start: "2026-08-20T14:00:00.000Z",
    scheduled_end: "2026-08-20T15:00:00.000Z",
  };

  it("compatibiliza serviço, data e período", () => {
    expect(
      matchesCancelledSlot(
        {
          id: "w1",
          service_id: "service-1",
          preferred_employee_id: null,
          preferred_date: "2026-08-20",
          preferred_period: "any",
          preferred_time_start: null,
          preferred_time_end: null,
          status: "waiting",
        },
        slot,
        "America/Sao_Paulo",
      ),
    ).toBe(true);
  });

  it("rejeita serviço diferente", () => {
    expect(
      matchesCancelledSlot(
        {
          id: "w2",
          service_id: "other",
          preferred_employee_id: null,
          preferred_date: null,
          preferred_period: "any",
          preferred_time_start: null,
          preferred_time_end: null,
          status: "waiting",
        },
        slot,
        "America/Sao_Paulo",
      ),
    ).toBe(false);
  });

  it("conta entradas compatíveis após cancelamento", () => {
    const afternoonSlot = {
      service_id: "service-1",
      employee_id: "employee-1",
      scheduled_start: "2026-08-20T17:00:00.000Z",
      scheduled_end: "2026-08-20T18:00:00.000Z",
    };

    const count = countMatchingWaitlistEntries(
      [
        {
          id: "w1",
          service_id: "service-1",
          preferred_employee_id: "employee-1",
          preferred_date: "2026-08-20",
          preferred_period: "afternoon",
          preferred_time_start: null,
          preferred_time_end: null,
          status: "waiting",
        },
        {
          id: "w2",
          service_id: "service-1",
          preferred_employee_id: null,
          preferred_date: null,
          preferred_period: "any",
          preferred_time_start: null,
          preferred_time_end: null,
          status: "contacted",
        },
      ],
      afternoonSlot,
      "America/Sao_Paulo",
    );

    expect(count).toBe(2);
  });
});

describe("hourToWaitlistPeriod", () => {
  it("mapeia períodos do dia", () => {
    expect(hourToWaitlistPeriod(9)).toBe("morning");
    expect(hourToWaitlistPeriod(14)).toBe("afternoon");
    expect(hourToWaitlistPeriod(19)).toBe("evening");
  });
});

describe("isRangeBlockedByTimeBlocks", () => {
  it("detecta bloqueio sobreposto", () => {
    const blocked = isRangeBlockedByTimeBlocks(
      new Date("2026-08-20T12:00:00.000Z").getTime(),
      new Date("2026-08-20T13:00:00.000Z").getTime(),
      [
        {
          block_start: "2026-08-20T11:30:00.000Z",
          block_end: "2026-08-20T12:30:00.000Z",
          employee_id: "employee-1",
        },
      ],
      "employee-1",
    );

    expect(blocked).toBe(true);
  });

  it("ignora bloqueio de outro profissional", () => {
    const blocked = isRangeBlockedByTimeBlocks(
      new Date("2026-08-20T12:00:00.000Z").getTime(),
      new Date("2026-08-20T13:00:00.000Z").getTime(),
      [
        {
          block_start: "2026-08-20T11:30:00.000Z",
          block_end: "2026-08-20T12:30:00.000Z",
          employee_id: "employee-2",
        },
      ],
      "employee-1",
    );

    expect(blocked).toBe(false);
  });
});

describe("waitlistFormSchema", () => {
  it("valida cadastro na lista de espera", () => {
    const parsed = waitlistFormSchema.safeParse({
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      petId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
      preferredEmployeeId: null,
      preferredDate: "2026-08-21",
      preferredPeriod: "morning",
      preferredTimeStart: null,
      preferredTimeEnd: null,
      notes: "Prefere cedo",
    });

    expect(parsed.success).toBe(true);
  });
});

describe("timeBlockFormSchema", () => {
  it("valida bloqueio de horário", () => {
    const parsed = timeBlockFormSchema.safeParse({
      date: "2026-12-01",
      startTime: "12:00",
      endTime: "13:00",
      employeeId: null,
      reason: "Almoço",
      companyTimezone: "America/Sao_Paulo",
    });

    expect(parsed.success).toBe(true);
  });
});

describe("formatWaitlistPreference", () => {
  it("formata preferência legível", () => {
    expect(
      formatWaitlistPreference({
        preferred_date: "2026-08-20",
        preferred_period: "morning",
        preferred_time_start: "09:00:00",
        preferred_time_end: "11:00:00",
      }),
    ).toContain("Manhã");
  });
});

describe("isolamento multi-tenant (queries)", () => {
  it("retorna vazio para ids inválidos", async () => {
    const { getActiveWaitlist } = await import("@/features/appointments/waitlist/queries");
    const { getTimeBlocksForDay } = await import("@/features/appointments/time-blocks/queries");

    await expect(getActiveWaitlist("invalid")).resolves.toEqual([]);
    await expect(getTimeBlocksForDay("invalid", "2026-08-20", "America/Sao_Paulo")).resolves.toEqual([]);
  });
});

describe("comportamento mobile básico", () => {
  it("expõe utilitário de slot para botão mobile", () => {
    expect(buildSlotPrefill("2026-08-20", "09:00").time).toBe("09:00");
  });
});
