import { describe, expect, it } from "vitest";

import { buildAppointmentNotificationRows, buildPetReadyNotificationRow } from "@/features/notifications/build-queue-rows";
import { computeReminderScheduledFor } from "@/features/notifications/scheduler";
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
    customerId: "cust-1",
    petId: "pet-1",
    scheduledStart: localDateTimeToUtcIso("2026-08-20", "14:00", TIMEZONE),
    status: "scheduled",
    customerName: "Maria",
    customerPhone: "11987654321",
    petName: "Thor",
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
  };
}

describe("buildAppointmentNotificationRows", () => {
  it("A) cria confirmação ao criar agendamento", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    const rows = buildAppointmentNotificationRows({
      context: baseContext(),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    expect(rows.some((row) => row.type === "appointment_confirmation")).toBe(true);
    const confirmation = rows.find((row) => row.type === "appointment_confirmation");
    expect(confirmation?.destination_phone).toBe("+5511987654321");
    expect(confirmation?.message_body).toContain("Maria");
    expect(confirmation?.message_body).toContain("Thor");
  });

  it("B) cria lembrete 24h", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-20", "14:00", TIMEZONE);
    const now = new Date(new Date(scheduledStart).getTime() - 48 * 60 * 60 * 1000);
    const rows = buildAppointmentNotificationRows({
      context: baseContext({ scheduledStart }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    const reminder = rows.find((row) => row.type === "appointment_reminder_24h");
    expect(reminder).toBeDefined();
    expect(reminder?.scheduled_for).toBe(
      computeReminderScheduledFor(scheduledStart, 24, now),
    );
  });

  it("C) cria lembrete 2h", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-20", "14:00", TIMEZONE);
    const now = new Date(new Date(scheduledStart).getTime() - 6 * 60 * 60 * 1000);
    const rows = buildAppointmentNotificationRows({
      context: baseContext({ scheduledStart }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    const reminder = rows.find((row) => row.type === "appointment_reminder_2h");
    expect(reminder).toBeDefined();
    expect(reminder?.scheduled_for).toBe(
      computeReminderScheduledFor(scheduledStart, 2, now),
    );
  });

  it("D) toggle desativado não gera notificação", () => {
    const rows = buildAppointmentNotificationRows({
      context: baseContext(),
      settings: {
        ...allEnabledSettings(),
        appointmentConfirmationEnabled: false,
        reminder24hEnabled: false,
        reminder2hEnabled: false,
      },
      timeZone: TIMEZONE,
      now: new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(rows).toHaveLength(0);
  });

  it("E) edição recalcula lembretes com novo horário", () => {
    const oldStart = localDateTimeToUtcIso("2026-08-20", "14:00", TIMEZONE);
    const newStart = localDateTimeToUtcIso("2026-08-21", "10:00", TIMEZONE);
    const now = new Date("2026-08-17T12:00:00.000Z");

    const oldRows = buildAppointmentNotificationRows({
      context: baseContext({ scheduledStart: oldStart }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    const newRows = buildAppointmentNotificationRows({
      context: baseContext({ scheduledStart: newStart }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    const old24 = oldRows.find((row) => row.type === "appointment_reminder_24h");
    const new24 = newRows.find((row) => row.type === "appointment_reminder_24h");

    expect(old24?.scheduled_for).not.toBe(new24?.scheduled_for);
  });

  it("F) cancelamento não gera novas notificações para status cancelado", () => {
    const rows = buildAppointmentNotificationRows({
      context: baseContext({ status: "cancelled" }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now: new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(rows).toHaveLength(0);
  });

  it("I) usa timezone da empresa no conteúdo da confirmação", () => {
    const scheduledStart = "2026-08-20T17:00:00.000Z";
    const message = renderNotificationMessage("appointment_confirmation", {
      tutorName: "Maria",
      petName: "Thor",
      appointmentStartUtcIso: scheduledStart,
      timeZone: TIMEZONE,
    });

    expect(message).toContain("14:00");
  });

  it("K) horário passado não gera lembrete inválido", () => {
    const scheduledStart = localDateTimeToUtcIso("2026-08-17", "15:00", TIMEZONE);
    const now = new Date(localDateTimeToUtcIso("2026-08-17", "14:30", TIMEZONE));

    const rows = buildAppointmentNotificationRows({
      context: baseContext({ scheduledStart }),
      settings: allEnabledSettings(),
      timeZone: TIMEZONE,
      now,
    });

    expect(rows.find((row) => row.type === "appointment_reminder_24h")).toBeUndefined();
    expect(rows.find((row) => row.type === "appointment_reminder_2h")).toBeUndefined();
  });

  it("J) isola company_id nas linhas geradas", () => {
    const rows = buildAppointmentNotificationRows({
      context: baseContext({ companyId: "company-b" }),
      settings: allEnabledSettings("company-b"),
      timeZone: TIMEZONE,
      now: new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(rows.every((row) => row.company_id === "company-b")).toBe(true);
  });
});

describe("buildPetReadyNotificationRow", () => {
  it("G) pet ready gera notificação", () => {
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
    expect(row?.service_order_id).toBe("so-1");
    expect(row?.message_body).toContain("pronto");
  });

  it("H) pet ready usa service_order_id para idempotência", () => {
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
    expect(row?.appointment_id).toBeNull();
  });
});

describe("computeReminderScheduledFor", () => {
  it("retorna null quando lembrete já passou", () => {
    const appointmentStart = "2026-08-20T14:00:00.000Z";
    const now = new Date("2026-08-20T13:30:00.000Z");

    expect(computeReminderScheduledFor(appointmentStart, 2, now)).toBeNull();
  });
});

describe("renderNotificationMessage", () => {
  it("gera templates esperados", () => {
    const ctx = {
      tutorName: "João",
      petName: "Mel",
      appointmentStartUtcIso: localDateTimeToUtcIso("2026-08-20", "09:30", TIMEZONE),
      timeZone: TIMEZONE,
    };

    expect(renderNotificationMessage("appointment_reminder_24h", ctx)).toContain("amanhã");
    expect(renderNotificationMessage("appointment_reminder_2h", ctx)).toContain("hoje");
    expect(renderNotificationMessage("pet_ready", ctx)).toContain("Mel");
  });
});
