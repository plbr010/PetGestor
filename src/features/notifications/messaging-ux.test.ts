import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getFriendlyNotificationError, getNotificationDisplayStatus, NOTIFICATION_DISPLAY_STATUS_LABELS } from "@/features/notifications/display-status";
import {
  buildMessagePreviewExamples,
  formatNotificationWhen,
  getHistoryRecipientLine,
  getWhatsAppIntegrationPresentation,
  HISTORY_TYPE_LABELS,
  subtractHoursFromTime,
  summarizeLastMessage,
} from "@/features/notifications/messaging-ux";
import type { NotificationHistoryItem } from "@/features/notifications/types";

const TIMEZONE = "America/Sao_Paulo";

function historyItem(
  overrides: Partial<NotificationHistoryItem> = {},
): NotificationHistoryItem {
  return {
    id: "nq-1",
    recipientType: "customer",
    recipientName: "Maria",
    petName: "Thor",
    serviceName: "Banho",
    type: "appointment_reminder_2h",
    scheduledFor: "2026-08-17T16:00:00.000Z",
    status: "sent",
    lastError: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    ...overrides,
  };
}

describe("status da integração WhatsApp (UX)", () => {
  it("mostra ativo quando configurado e envio ligado", () => {
    expect(
      getWhatsAppIntegrationPresentation({ configured: true, sendEnabled: true }),
    ).toMatchObject({
      tone: "active",
      title: "WhatsApp conectado",
      badge: "Ativo",
      integrationLabel: "Ativa",
      sendLabel: "Ativo",
    });
  });

  it("mostra pendente quando ainda não há configuração", () => {
    expect(
      getWhatsAppIntegrationPresentation({ configured: false, sendEnabled: false }),
    ).toMatchObject({
      tone: "pending",
      title: "WhatsApp ainda não configurado",
      badge: "Configuração pendente",
    });
  });

  it("mostra desativado quando a conta existe mas o envio está off", () => {
    expect(
      getWhatsAppIntegrationPresentation({ configured: true, sendEnabled: false }),
    ).toMatchObject({
      tone: "disabled",
      title: "Envios desativados",
      badge: "Desativado",
      sendLabel: "Desativado",
    });
  });
});

describe("previews e horário", () => {
  it("calcula 2 horas antes no exemplo das 15:00", () => {
    expect(subtractHoursFromTime("15:00", 2)).toBe("13:00");
  });

  it("monta preview do tutor no dia com o horário configurado", () => {
    const previews = buildMessagePreviewExamples({
      companyName: "Pet Shop X",
      sameDayReminderTime: "08:00",
    });

    expect(previews.customer_same_day_reminder.whenLabel).toBe("Hoje 08:00");
    expect(previews.customer_same_day_reminder.body).toContain("Maria");
    expect(previews.customer_same_day_reminder.body).toContain("Thor");
    expect(previews.customer_same_day_reminder.body).toContain("15:00");
    expect(previews.customer_same_day_reminder.body).toContain("Pet Shop X");
    expect(previews.appointment_reminder_2h.body).toContain("2 horas");
    expect(previews.pet_ready.body).toContain("pronto");
    expect(previews.employee_same_day_reminder.body).toContain("João");
  });
});

describe("histórico UX", () => {
  it("traduz status para linguagem simples", () => {
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.pending).toBe("Agendada");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.processing).toBe("Enviando");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.sent).toBe("Enviada");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.delivered).toBe("Entregue");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.read).toBe("Lida");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.failed).toBe("Falhou");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.cancelled).toBe("Cancelada");
    expect(NOTIFICATION_DISPLAY_STATUS_LABELS.simulated).toBe("Simulação");
  });

  it("não inventa lida sem confirmação", () => {
    expect(
      getNotificationDisplayStatus({
        status: "sent",
        deliveredAt: "2026-08-17T16:01:00.000Z",
        readAt: null,
      }),
    ).toBe("delivered");
  });

  it("mostra tutor e funcionário de forma clara", () => {
    expect(getHistoryRecipientLine("customer", "Thor")).toBe("Tutor do Thor");
    expect(getHistoryRecipientLine("employee", "Thor")).toBe("Funcionário");
    expect(HISTORY_TYPE_LABELS.appointment_reminder_2h).toBe("Lembrete 2h");
    expect(HISTORY_TYPE_LABELS.customer_same_day_reminder).toBe("Lembrete do dia");
  });

  it("formata hoje no timezone da empresa", () => {
    const now = new Date("2026-08-17T18:00:00.000Z");
    expect(formatNotificationWhen("2026-08-17T16:00:00.000Z", TIMEZONE, now)).toBe("Hoje 13:00");
  });

  it("resume última mensagem e estado vazio", () => {
    expect(summarizeLastMessage([], TIMEZONE).label).toBe("Ainda não houve envio");
    expect(
      summarizeLastMessage(
        [historyItem({ deliveredAt: "2026-08-17T16:05:00.000Z" })],
        TIMEZONE,
        new Date("2026-08-17T18:00:00.000Z"),
      ).outcome,
    ).toBe("success");
    expect(
      summarizeLastMessage(
        [historyItem({ status: "failed", failedAt: "2026-08-17T16:05:00.000Z" })],
        TIMEZONE,
      ).outcome,
    ).toBe("failed");
  });
});

describe("erros amigáveis", () => {
  it("explica telefone, template, configuração e retry", () => {
    expect(getFriendlyNotificationError("invalid_phone", "customer")).toBe(
      "Telefone do tutor inválido.",
    );
    expect(getFriendlyNotificationError("invalid_phone", "employee")).toBe(
      "Telefone do funcionário inválido.",
    );
    expect(getFriendlyNotificationError("whatsapp_not_configured")).toBe(
      "WhatsApp ainda não está configurado.",
    );
    expect(getFriendlyNotificationError("template_not_configured")).toBe(
      "Template de mensagem indisponível.",
    );
    expect(getFriendlyNotificationError("timeout")).toBe(
      "Mensagem não pôde ser enviada. O sistema tentará novamente.",
    );
  });
});

describe("tela não expõe segredos", () => {
  it("painel e status público não citam token, secret ou IDs técnicos", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/features/notifications/components/notification-settings-panel.tsx"),
      "utf8",
    );
    const publicStatus = readFileSync(
      join(process.cwd(), "src/features/notifications/whatsapp-public-status.ts"),
      "utf8",
    );

    expect(panel).not.toMatch(/WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|CRON_SECRET|PHONE_NUMBER_ID/);
    expect(publicStatus).toContain("canSendTest");
    expect(publicStatus).not.toContain("accessToken");
  });

  it("explica que não existe envio manual", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/features/notifications/components/notification-settings-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("Você não precisa enviar manualmente");
    expect(panel).toContain("Mensagens para o tutor");
    expect(panel).toContain("Mensagens para o funcionário");
    expect(panel).toContain("Ver exemplo");
  });
});
