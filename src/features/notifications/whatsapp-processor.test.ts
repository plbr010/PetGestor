import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "@/features/notifications/cron-auth";
import {
  getFriendlyNotificationError,
  getNotificationDisplayStatus,
} from "@/features/notifications/display-status";
import {
  processClaimedNotifications,
  processDueNotifications,
  type ClaimedNotification,
  type ProcessorContext,
} from "@/features/notifications/processor";
import {
  computeNextAttemptAt,
  decideNotificationSend,
  isClaimableNotification,
} from "@/features/notifications/send-policy";
import type { NotificationType } from "@/features/notifications/types";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { getTemplateNameForType, getWhatsAppMessagesUrl } from "@/lib/whatsapp/config";
import { isRetryableWhatsAppFailure } from "@/lib/whatsapp/errors";
import { buildWhatsAppTemplateParameters } from "@/lib/whatsapp/templates";
import type { SendWhatsAppTemplateInput, WhatsAppSendResult } from "@/lib/whatsapp/types";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const APPOINTMENT_START = "2026-08-17T18:00:00.000Z";
const PHONE = "+5511987654321";

function claimed(
  overrides: Partial<ClaimedNotification> & { type: NotificationType },
): ClaimedNotification {
  return {
    id: overrides.id ?? "nq-1",
    company_id: overrides.company_id ?? "company-a",
    type: overrides.type,
    recipient_type:
      overrides.recipient_type ??
      (overrides.type.startsWith("employee") ? "employee" : "customer"),
    destination_phone: overrides.destination_phone ?? PHONE,
    scheduled_for: overrides.scheduled_for ?? "2026-08-17T11:00:00.000Z",
    appointment_id: overrides.appointment_id === undefined ? "appt-1" : overrides.appointment_id,
    service_order_id: overrides.service_order_id ?? null,
    attempts: overrides.attempts ?? 1,
    max_attempts: overrides.max_attempts ?? 4,
    status: overrides.status ?? "processing",
    claimed_at: overrides.claimed_at ?? NOW.toISOString(),
  };
}

function context(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    settingsEnabled: true,
    appointmentStatus: "scheduled",
    appointmentStart: APPOINTMENT_START,
    appointmentDeleted: false,
    timeZone: "America/Sao_Paulo",
    tutorName: "Maria",
    petName: "Thor",
    serviceName: "Banho",
    companyName: "PetGestor Shop",
    employeeName: "João",
    ...overrides,
  };
}

type MemoryRow = ClaimedNotification & {
  next_attempt_at: string | null;
};

function createMemoryQueue(initial: MemoryRow[]) {
  const rows = initial.map((row) => ({ ...row }));

  const claim = async (limit: number, now: Date) => {
    const claimedRows: ClaimedNotification[] = [];

    for (const row of rows) {
      if (claimedRows.length >= limit) {
        break;
      }

      if (
        !isClaimableNotification({
          status: row.status,
          scheduledFor: row.scheduled_for,
          nextAttemptAt: row.next_attempt_at,
          claimedAt: row.claimed_at,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          now,
        })
      ) {
        continue;
      }

      row.status = "processing";
      row.claimed_at = now.toISOString();
      row.attempts += 1;
      claimedRows.push({ ...row });
    }

    return claimedRows;
  };

  const update = async (row: ClaimedNotification, patch: Record<string, unknown>) => {
    const current = rows.find((item) => item.id === row.id && item.company_id === row.company_id);
    if (!current) {
      return;
    }

    Object.assign(current, patch);
  };

  return { rows, claim, update };
}

const successSend: WhatsAppSendResult = {
  ok: true,
  simulated: false,
  messageId: "wamid.test-1",
};

describe("A) processar notification pending vencida", () => {
  it("envia quando está pending e scheduled_for já passou", async () => {
    const send = vi.fn(async () => successSend);
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({ type: "customer_same_day_reminder" });

    const summary = await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context(),
        send,
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(summary.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({
      status: "sent",
      provider: "whatsapp",
      provider_message_id: "wamid.test-1",
    });
    expect(updates[0]).not.toHaveProperty("delivered_at");
  });
});

describe("B) não enviar notification futura", () => {
  it("claim ignora scheduled_for no futuro", async () => {
    const future = new Date("2026-08-17T16:00:00.000Z").toISOString();
    const queue = createMemoryQueue([
      {
        ...claimed({
          type: "appointment_reminder_2h",
          status: "pending",
          attempts: 0,
          claimed_at: null,
          scheduled_for: future,
        }),
        next_attempt_at: null,
      },
    ]);
    const send = vi.fn(async () => successSend);

    const summary = await processDueNotifications({
      now: NOW,
      deps: {
        claim: queue.claim,
        loadContext: async () => context(),
        send,
        update: queue.update,
      },
    });

    expect(summary.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("C) não duplicar envio", () => {
  it("depois de sent, o mesmo registro não é reclamado", async () => {
    const queue = createMemoryQueue([
      {
        ...claimed({
          type: "pet_ready",
          status: "pending",
          attempts: 0,
          claimed_at: null,
          appointment_id: null,
          service_order_id: "so-1",
        }),
        next_attempt_at: null,
      },
    ]);
    const send = vi.fn(async () => successSend);

    const deps = {
      claim: queue.claim,
      loadContext: async () => context(),
      send,
      update: queue.update,
    };

    await processDueNotifications({ now: NOW, deps });
    const second = await processDueNotifications({ now: NOW, deps });

    expect(send).toHaveBeenCalledTimes(1);
    expect(second.claimed).toBe(0);
    expect(queue.rows[0]?.status).toBe("sent");
  });
});

describe("D) locking concorrente", () => {
  it("dois workers não enviam a mesma notificação", async () => {
    const queue = createMemoryQueue([
      {
        ...claimed({
          type: "customer_same_day_reminder",
          status: "pending",
          attempts: 0,
          claimed_at: null,
        }),
        next_attempt_at: null,
      },
    ]);
    const send = vi.fn(async () => successSend);
    const deps = {
      claim: queue.claim,
      loadContext: async () => context(),
      send,
      update: queue.update,
    };

    const [first, second] = await Promise.all([
      processDueNotifications({ now: NOW, deps }),
      processDueNotifications({ now: NOW, deps }),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("E) sucesso da Meta", () => {
  it("grava message id e status sent sem marcar entregue", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.graph-1" }] }),
    }));

    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");

    const result = await sendWhatsAppTemplate(
      {
        to: PHONE,
        template: "petgestor_pet_ready",
        language: "pt_BR",
        parameters: [
          { type: "text", text: "Maria" },
          { type: "text", text: "Thor" },
        ],
      },
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(result).toEqual({ ok: true, simulated: false, messageId: "wamid.graph-1" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe("https://graph.facebook.com/v22.0/123456789/messages");
    const body = JSON.parse(String(init.body)) as { messaging_product: string; type: string };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.type).toBe("template");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization.startsWith("Bearer ")).toBe(true);
  });
});

describe("F) erro temporário + retry", () => {
  it("volta para pending com next_attempt_at", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({ type: "pet_ready", appointment_id: null, service_order_id: "so-1" });

    const summary = await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context(),
        send: async () => ({
          ok: false,
          retryable: true,
          errorCode: "timeout",
          errorMessage: "Tempo esgotado ao chamar a API do WhatsApp.",
          httpStatus: 503,
        }),
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(summary.retried).toBe(1);
    expect(updates[0]?.status).toBe("pending");
    expect(updates[0]?.next_attempt_at).toBe(computeNextAttemptAt(1, NOW).toISOString());
    expect(isRetryableWhatsAppFailure({ httpStatus: 503 })).toBe(true);
    expect(isRetryableWhatsAppFailure({ httpStatus: 429 })).toBe(true);
  });
});

describe("G) erro definitivo", () => {
  it("marca failed sem retry para template inválido", async () => {
    const send = vi.fn(async () => ({
      ok: false as const,
      retryable: false,
      errorCode: "132001",
      errorMessage: "Template does not exist",
      httpStatus: 400,
    }));
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({ type: "customer_same_day_reminder" });

    const summary = await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context(),
        send,
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(summary.failed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(updates[0]?.status).toBe("failed");
    expect(isRetryableWhatsAppFailure({ httpStatus: 400, errorCode: "132001" })).toBe(false);
  });
});

describe("H) telefone inválido", () => {
  it("falha sem chamar o provider", async () => {
    const send = vi.fn(async () => successSend);
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({
      type: "customer_same_day_reminder",
      destination_phone: "123",
    });

    await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context(),
        send,
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(send).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "failed", last_error: "invalid_phone" });
  });
});

describe("I) appointment cancelado antes do processamento", () => {
  it("cancela sem enviar", async () => {
    const send = vi.fn(async () => successSend);
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({ type: "appointment_reminder_2h" });

    await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context({ appointmentStatus: "cancelled" }),
        send,
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(send).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({
      status: "cancelled",
      last_error: "appointment_cancelled",
    });
  });
});

describe("J) lembrete 2h atrasado após o atendimento", () => {
  it("não dispara depois que o horário já começou", async () => {
    const send = vi.fn(async () => successSend);
    const row = claimed({ type: "appointment_reminder_2h" });

    await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () =>
          context({ appointmentStart: "2026-08-17T11:00:00.000Z" }),
        send,
        update: async () => undefined,
      },
      NOW,
    );

    expect(send).not.toHaveBeenCalled();
    expect(
      decideNotificationSend({
        type: "appointment_reminder_2h",
        scheduledFor: row.scheduled_for,
        destinationPhone: PHONE,
        now: NOW,
        settingsEnabled: true,
        appointmentStatus: "scheduled",
        appointmentStart: "2026-08-17T11:00:00.000Z",
        appointmentDeleted: false,
      }),
    ).toEqual({ action: "cancel", reason: "appointment_already_started" });
  });
});

describe("K) tutor", () => {
  it("usa template e parâmetros do tutor no dia", async () => {
    const send = vi.fn(async (input: SendWhatsAppTemplateInput) => {
      expect(input.template).toBe(getTemplateNameForType("customer_same_day_reminder"));
      expect(input.parameters.map((item) => item.text)).toEqual([
        "Maria",
        "Thor",
        "Banho",
        "15:00",
        "PetGestor Shop",
      ]);
      return successSend;
    });

    await processClaimedNotifications(
      [claimed({ type: "customer_same_day_reminder", recipient_type: "customer" })],
      {
        claim: async () => [],
        loadContext: async () => context(),
        send,
        update: async () => undefined,
      },
      NOW,
    );

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("L) funcionário", () => {
  it("usa os mesmos sendWhatsAppTemplate com parâmetros de equipe", async () => {
    const send = vi.fn(async (input: SendWhatsAppTemplateInput) => {
      expect(input.template).toBe(getTemplateNameForType("employee_2h_reminder"));
      expect(input.parameters.map((item) => item.text)).toEqual(["Thor", "15:00", "Banho"]);
      return successSend;
    });

    await processClaimedNotifications(
      [
        claimed({
          type: "employee_2h_reminder",
          recipient_type: "employee",
          scheduled_for: "2026-08-17T11:50:00.000Z",
        }),
      ],
      {
        claim: async () => [],
        loadContext: async () => context(),
        send,
        update: async () => undefined,
      },
      NOW,
    );

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("M) pet_ready", () => {
  it("envia template de pet pronto para o tutor", async () => {
    const send = vi.fn(async (input: SendWhatsAppTemplateInput) => {
      expect(input.template).toBe(getTemplateNameForType("pet_ready"));
      expect(input.parameters.map((item) => item.text)).toEqual(["Maria", "Thor"]);
      return successSend;
    });

    await processClaimedNotifications(
      [
        claimed({
          type: "pet_ready",
          recipient_type: "customer",
          appointment_id: null,
          service_order_id: "so-1",
        }),
      ],
      {
        claim: async () => [],
        loadContext: async () => context(),
        send,
        update: async () => undefined,
      },
      NOW,
    );

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("S) isolamento multi-tenant", () => {
  it("cada update usa o company_id da própria linha", async () => {
    const seen: string[] = [];
    const send = vi.fn(async () => successSend);
    const rows = [
      claimed({ id: "nq-a", company_id: "company-a", type: "pet_ready" }),
      claimed({ id: "nq-b", company_id: "company-b", type: "pet_ready" }),
    ];

    await processClaimedNotifications(
      rows,
      {
        claim: async () => rows,
        loadContext: async () => context(),
        send,
        update: async (row) => {
          seen.push(row.company_id);
        },
      },
      NOW,
    );

    expect(seen).toEqual(["company-a", "company-b"]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("não atualiza a empresa B ao processar a empresa A", async () => {
    const queue = createMemoryQueue([
      {
        ...claimed({
          id: "nq-a",
          company_id: "company-a",
          type: "customer_same_day_reminder",
          status: "pending",
          attempts: 0,
          claimed_at: null,
        }),
        next_attempt_at: null,
      },
      {
        ...claimed({
          id: "nq-b",
          company_id: "company-b",
          type: "customer_same_day_reminder",
          status: "pending",
          attempts: 0,
          claimed_at: null,
        }),
        next_attempt_at: null,
      },
    ]);

    await processDueNotifications({
      now: NOW,
      limit: 1,
      deps: {
        claim: queue.claim,
        loadContext: async () => context(),
        send: async () => successSend,
        update: queue.update,
      },
    });

    expect(queue.rows.find((row) => row.company_id === "company-a")?.status).toBe("sent");
    expect(queue.rows.find((row) => row.company_id === "company-b")?.status).toBe("pending");
  });
});

describe("T) WHATSAPP_SEND_ENABLED=false", () => {
  it("não chama a Meta e grava simulated, sem delivered", async () => {
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "false");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");

    const fetchFn = vi.fn();
    const updates: Array<Record<string, unknown>> = [];
    const row = claimed({ type: "pet_ready" });

    await processClaimedNotifications(
      [row],
      {
        claim: async () => [row],
        loadContext: async () => context(),
        send: (input) => sendWhatsAppTemplate(input, { fetchFn: fetchFn as unknown as typeof fetch }),
        update: async (_row, patch) => {
          updates.push(patch);
        },
      },
      NOW,
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(updates[0]?.status).toBe("simulated");
    expect(updates[0]).not.toHaveProperty("delivered_at");
    expect(updates[0]?.provider_message_id).toBeUndefined();
  });
});

describe("templates e política", () => {
  it("mapeia parâmetros oficiais por tipo", () => {
    const ctx = {
      tutorName: "Maria",
      petName: "Thor",
      serviceName: "Banho",
      companyName: "PetGestor Shop",
      employeeName: "João",
      appointmentStartUtcIso: APPOINTMENT_START,
      timeZone: "America/Sao_Paulo",
    };

    expect(buildWhatsAppTemplateParameters("employee_same_day_reminder", ctx)?.map((item) => item.text)).toEqual([
      "João",
      "Thor",
      "15:00",
      "Banho",
    ]);
  });

  it("histórico não inventa lida sem readAt", () => {
    expect(
      getNotificationDisplayStatus({
        status: "sent",
        deliveredAt: "2026-08-17T12:01:00.000Z",
        readAt: null,
      }),
    ).toBe("delivered");
    expect(getFriendlyNotificationError("invalid_phone")).toContain("Telefone");
  });

  it("cron recusa sem Bearer secreto", () => {
    expect(isAuthorizedCronRequest(null, "secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer secret", "secret")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer other", "secret")).toBe(false);
  });

  it("versão da Graph API fica centralizada", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v21.0");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "999");
    expect(getWhatsAppMessagesUrl()).toBe("https://graph.facebook.com/v21.0/999/messages");
  });

  it("não expõe token WhatsApp no frontend nem no .env.example", () => {
    const example = readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
    expect(example).toContain("WHATSAPP_ACCESS_TOKEN=");
    expect(example).not.toMatch(/NEXT_PUBLIC_WHATSAPP_/);
    expect(example).not.toMatch(/EAA[A-Za-z0-9]{10,}/);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
