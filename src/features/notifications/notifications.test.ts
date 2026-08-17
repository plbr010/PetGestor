import { describe, expect, it } from "vitest";

import { buildAppointmentNotificationRows, buildPetReadyNotificationRow } from "@/features/notifications/build-queue-rows";
import {
  computeReminderScheduledFor,
  computeSameDayReminderScheduledFor,
  isActiveAppointmentStatus,
} from "@/features/notifications/scheduler";
import { renderNotificationMessage } from "@/features/notifications/templates";
import type {
  AppointmentNotificationContext,
  CompanyNotificationSettings,
} from "@/features/notifications/types";
import { localDateTimeToUtcIso } from "@/lib/timezone";

const TIMEZONE = "America/Sao_Paulo";

function baseContext(
  overrides: Partial<AppointmentNotificationContext> = {},
): AppointmentNotificationContext {
  return {
    appointmentId: "appt-1",
    companyId: "company-a",
    companyName: "PetGestor Shop",
    customerId: "cust-1",
    petId: "pet-1",
    employeeId: "emp-1",
    employeeName: "João",
    employeePhone: "32988887777",
    scheduledStart: localDateTimeToUtcIso("2026-08-20", "15:00", TIMEZONE),
    status: "scheduled",
    customerName: "Maria",
    customerPhone: "11987654321",
    petName: "Thor",
    serviceName: "Banho",
    ...overrides,
  };
}

function allEnabledSettings(companyId = "company-a"): CompanyNotificationSettings {
  return {
    companyId,
    appointmentConfirmationEnabled: true,
    reminder24hEnabled: true,
    reminder2hEnabled: true,
    petReadyEnabled: true,
    customerSameDayReminderEnabled: true,
    employeeSameDayReminderEnabled: true,
    employeeReminder2hEnabled: true,
    sameDayReminderTime: "08:00",
  };
}

function rowsAt(nowIso: string, context = baseContext(), settings = allEnabledSettings()) {
  return buildAppointmentNotificationRows({
    context,
    settings,
    timeZone: TIMEZONE,
    now: new Date(nowIso),
  });
}

describe("tutor lembrete do dia", () => {
  it("agenda para o horário configurado no timezone da empresa", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-17", "15:00", TIMEZONE);
    const now = localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE);
    const rows = rowsAt(now, baseContext({ scheduledStart }));
    const reminder = rows.find((row) => row.type === "customer_same_day_reminder");

    expect(reminder).toBeDefined();
    expect(reminder?.scheduled_for).toBe(
      localDateTimeToUtcIso("2026-08-17", "08:00", TIMEZONE),
    );
    expect(reminder?.recipient_type).toBe("customer");
    expect(reminder?.message_body).toContain("Maria");
    expect(reminder?.message_body).toContain("Thor");
    expect(reminder?.message_body).toContain("Banho");
    expect(reminder?.message_body).toContain("PetGestor Shop");
  });
});

describe("tutor lembrete 2h", () => {
  it("agenda appointment_at - 2h", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-20", "15:00", TIMEZONE);
    const now = localDateTimeToUtcIso("2026-08-19", "10:00", TIMEZONE);
    const rows = rowsAt(now, baseContext({ scheduledStart }));
    const reminder = rows.find((row) => row.type === "appointment_reminder_2h");

    expect(reminder).toBeDefined();
    expect(reminder?.scheduled_for).toBe(
      computeReminderScheduledFor(scheduledStart, 2, new Date(now)),
    );
    expect(reminder?.message_body).toContain("2 horas");
  });
});

describe("funcionário lembrete do dia", () => {
  it("cria lembrete no mesmo horário configurado", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-17", "15:00", TIMEZONE);
    const now = localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE);
    const rows = rowsAt(now, baseContext({ scheduledStart }));
    const reminder = rows.find((row) => row.type === "employee_same_day_reminder");

    expect(reminder).toBeDefined();
    expect(reminder?.recipient_type).toBe("employee");
    expect(reminder?.employee_id).toBe("emp-1");
    expect(reminder?.destination_phone).toBe("+5532988887777");
    expect(reminder?.message_body).toContain("João");
    expect(reminder?.scheduled_for).toBe(
      localDateTimeToUtcIso("2026-08-17", "08:00", TIMEZONE),
    );
  });
});

describe("funcionário lembrete 2h", () => {
  it("agenda 2h antes para o funcionário", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-20", "15:00", TIMEZONE);
    const now = localDateTimeToUtcIso("2026-08-19", "10:00", TIMEZONE);
    const rows = rowsAt(now, baseContext({ scheduledStart }));
    const reminder = rows.find((row) => row.type === "employee_2h_reminder");

    expect(reminder).toBeDefined();
    expect(reminder?.scheduled_for).toBe(
      computeReminderScheduledFor(scheduledStart, 2, new Date(now)),
    );
    expect(reminder?.message_body).toContain("Thor");
    expect(reminder?.message_body).toContain("Banho");
  });
});

describe("pet pronto", () => {
  it("gera uma notificação para o tutor", () => {
    const row = buildPetReadyNotificationRow({
      companyId: "company-a",
      customerId: "cust-1",
      petId: "pet-1",
      serviceOrderId: "so-1",
      customerName: "Maria",
      customerPhone: "11987654321",
      petName: "Thor",
      timeZone: TIMEZONE,
      now: new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(row?.type).toBe("pet_ready");
    expect(row?.recipient_type).toBe("customer");
    expect(row?.service_order_id).toBe("so-1");
    expect(row?.appointment_id).toBeNull();
    expect(row?.message_body).toContain("pronto");
    expect(row?.message_body).toContain("buscado");
  });
});

describe("timezone", () => {
  it("usa o dia local da empresa, não UTC", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-17", "15:00", TIMEZONE);
    const scheduledFor = computeSameDayReminderScheduledFor(
      scheduledStart,
      "08:00",
      TIMEZONE,
      new Date(localDateTimeToUtcIso("2026-08-16", "23:00", TIMEZONE)),
    );

    expect(scheduledFor).toBe(localDateTimeToUtcIso("2026-08-17", "08:00", TIMEZONE));
  });
});

describe("horário do dia já passado", () => {
  it("não cria lembrete do dia inválido", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-17", "15:00", TIMEZONE);
    const now = localDateTimeToUtcIso("2026-08-17", "09:00", TIMEZONE);
    const rows = rowsAt(now, baseContext({ scheduledStart }));

    expect(rows.find((row) => row.type === "customer_same_day_reminder")).toBeUndefined();
    expect(rows.find((row) => row.type === "employee_same_day_reminder")).toBeUndefined();
  });
});

describe("funcionário sem telefone", () => {
  it("não quebra e não cria notificação de equipe", () => {
    const now = localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE);
    const rows = rowsAt(
      now,
      baseContext({ employeePhone: null }),
    );

    expect(rows.some((row) => row.recipient_type === "customer")).toBe(true);
    expect(rows.some((row) => row.recipient_type === "employee")).toBe(false);
  });
});

describe("troca de funcionário", () => {
  it("recalcula lembretes para o novo funcionário", () => {
    const now = localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE);
    const joao = rowsAt(now, baseContext({ employeeId: "emp-joao", employeeName: "João" }));
    const maria = rowsAt(
      now,
      baseContext({ employeeId: "emp-maria", employeeName: "Maria F.", employeePhone: "32977776666" }),
    );

    const joaoRow = joao.find((row) => row.type === "employee_same_day_reminder");
    const mariaRow = maria.find((row) => row.type === "employee_same_day_reminder");

    expect(joaoRow?.employee_id).toBe("emp-joao");
    expect(mariaRow?.employee_id).toBe("emp-maria");
    expect(mariaRow?.destination_phone).toBe("+5532977776666");
    expect(mariaRow?.message_body).toContain("Maria F.");
  });
});

describe("alteração de horário", () => {
  it("recalcula lembretes 2h com o novo horário", () => {
    const now = localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE);
    const oldStart = localDateTimeToUtcIso("2026-08-20", "15:00", TIMEZONE);
    const newStart = localDateTimeToUtcIso("2026-08-21", "10:00", TIMEZONE);

    const oldRows = rowsAt(now, baseContext({ scheduledStart: oldStart }));
    const newRows = rowsAt(now, baseContext({ scheduledStart: newStart }));

    expect(
      oldRows.find((row) => row.type === "appointment_reminder_2h")?.scheduled_for,
    ).not.toBe(newRows.find((row) => row.type === "appointment_reminder_2h")?.scheduled_for);
    expect(
      oldRows.find((row) => row.type === "customer_same_day_reminder")?.scheduled_for,
    ).not.toBe(newRows.find((row) => row.type === "customer_same_day_reminder")?.scheduled_for);
  });
});

describe("cancelamento e no-show", () => {
  it("não gera novas notificações para cancelado", () => {
    const rows = rowsAt(
      localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE),
      baseContext({ status: "cancelled" }),
    );

    expect(rows).toHaveLength(0);
  });

  it("não gera lembretes posteriores para falta", () => {
    expect(isActiveAppointmentStatus("no_show")).toBe(false);
    const rows = rowsAt(
      localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE),
      baseContext({ status: "no_show" }),
    );

    expect(rows).toHaveLength(0);
  });
});

describe("idempotência", () => {
  it("gera no máximo um registro por tipo no mesmo appointment", () => {
    const rows = rowsAt(localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE));
    const types = rows.map((row) => row.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it("pet ready usa service_order_id como chave", () => {
    const row = buildPetReadyNotificationRow({
      companyId: "company-a",
      customerId: "cust-1",
      petId: "pet-1",
      serviceOrderId: "so-unique",
      customerName: "Maria",
      customerPhone: "11987654321",
      petName: "Thor",
      timeZone: TIMEZONE,
    });

    expect(row?.service_order_id).toBe("so-unique");
  });
});

describe("isolamento multi-tenant", () => {
  it("grava company_id da empresa do agendamento", () => {
    const rows = rowsAt(
      localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE),
      baseContext({ companyId: "company-b" }),
      allEnabledSettings("company-b"),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.company_id === "company-b")).toBe(true);
  });
});

describe("toggles desligados", () => {
  it("não gera lembretes quando as opções estão off", () => {
    const rows = rowsAt(
      localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE),
      baseContext(),
      {
        ...allEnabledSettings(),
        appointmentConfirmationEnabled: false,
        reminder24hEnabled: false,
        reminder2hEnabled: false,
        customerSameDayReminderEnabled: false,
        employeeSameDayReminderEnabled: false,
        employeeReminder2hEnabled: false,
      },
    );

    expect(rows).toHaveLength(0);
  });
});

describe("confirmação existente", () => {
  it("ainda cria confirmação ao tutor quando habilitada", () => {
    const rows = rowsAt(localDateTimeToUtcIso("2026-08-16", "10:00", TIMEZONE));
    expect(rows.some((row) => row.type === "appointment_confirmation")).toBe(true);
  });
});

describe("renderNotificationMessage", () => {
  it("usa timezone da empresa na hora", () => {
    const message = renderNotificationMessage("customer_same_day_reminder", {
      tutorName: "Maria",
      petName: "Thor",
      serviceName: "Banho",
      companyName: "PetGestor Shop",
      employeeName: "João",
      appointmentStartUtcIso: "2026-08-20T18:00:00.000Z",
      timeZone: TIMEZONE,
    });

    expect(message).toContain("15:00");
  });
});
