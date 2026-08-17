import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/notifications/processor", () => ({
  applyWhatsAppStatusEvent: vi.fn(async () => true),
  processDueNotifications: vi.fn(async () => ({
    claimed: 1,
    sent: 0,
    simulated: 1,
    failed: 0,
    cancelled: 0,
    retried: 0,
  })),
}));

import { GET as cronGet } from "@/app/api/cron/whatsapp-notifications/route";
import { GET as webhookGet, POST as webhookPost } from "@/app/api/webhooks/whatsapp/route";
import { applyWhatsAppStatusEvent } from "@/features/notifications/processor";
import {
  buildNotificationQueuePatchFromStatus,
  parseWhatsAppStatusEvents,
} from "@/features/notifications/whatsapp-webhook";
import {
  isValidWebhookVerifyRequest,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/signature";

const VERIFY_TOKEN = "verify-token-test";
const APP_SECRET = "app-secret-test";

function signedHeaders(rawBody: string, secret = APP_SECRET) {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return { "x-hub-signature-256": `sha256=${digest}` };
}

function statusPayload(status: string, id = "wamid.abc") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id,
                  status,
                  timestamp: "1755442800",
                  errors:
                    status === "failed"
                      ? [{ code: 131026, title: "Receiver unavailable" }]
                      : undefined,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("N) webhook verification", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
    vi.stubEnv("META_APP_SECRET", APP_SECRET);
  });

  it("devolve hub.challenge quando o token é válido", async () => {
    const request = new NextRequest(
      `http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-42`,
    );

    const response = await webhookGet(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-42");
  });

  it("recusa token inválido", async () => {
    const request = new NextRequest(
      `http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=challenge-42`,
    );

    const response = await webhookGet(request);

    expect(response.status).toBe(403);
    expect(
      isValidWebhookVerifyRequest({
        mode: "subscribe",
        token: "errado",
        challenge: "x",
        expectedToken: VERIFY_TOKEN,
      }),
    ).toBe(false);
  });
});

describe("O P Q) webhook delivered / read / failed", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
    vi.stubEnv("META_APP_SECRET", APP_SECRET);
    vi.mocked(applyWhatsAppStatusEvent).mockClear();
  });

  it("processa delivered", async () => {
    const events = parseWhatsAppStatusEvents(statusPayload("delivered"));
    expect(events[0]).toMatchObject({
      providerMessageId: "wamid.abc",
      status: "delivered",
    });

    const rawBody = JSON.stringify(statusPayload("delivered"));
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: rawBody,
      headers: signedHeaders(rawBody),
    });

    const response = await webhookPost(request);
    expect(response.status).toBe(200);
    expect(applyWhatsAppStatusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", providerMessageId: "wamid.abc" }),
    );
  });

  it("processa read", async () => {
    const events = parseWhatsAppStatusEvents(statusPayload("read"));
    expect(events[0]?.status).toBe("read");

    const rawBody = JSON.stringify(statusPayload("read"));
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: rawBody,
      headers: signedHeaders(rawBody),
    });

    await webhookPost(request);
    expect(applyWhatsAppStatusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "read" }),
    );
  });

  it("processa failed com código sanitizado", async () => {
    const events = parseWhatsAppStatusEvents(statusPayload("failed"));
    expect(events[0]).toMatchObject({
      status: "failed",
      errorCode: "131026",
    });

    const rawBody = JSON.stringify(statusPayload("failed"));
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: rawBody,
      headers: signedHeaders(rawBody),
    });

    await webhookPost(request);
    expect(applyWhatsAppStatusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "131026" }),
    );
  });

  it("monta patch de delivered/read/failed sem inventar lida", () => {
    expect(
      buildNotificationQueuePatchFromStatus({
        providerMessageId: "wamid.abc",
        status: "delivered",
        timestamp: "2026-08-17T12:00:00.000Z",
        errorCode: null,
        errorMessage: null,
      }),
    ).toEqual({ delivered_at: "2026-08-17T12:00:00.000Z" });

    expect(
      buildNotificationQueuePatchFromStatus({
        providerMessageId: "wamid.abc",
        status: "read",
        timestamp: "2026-08-17T12:01:00.000Z",
        errorCode: null,
        errorMessage: null,
      }),
    ).toMatchObject({
      read_at: "2026-08-17T12:01:00.000Z",
      delivered_at: "2026-08-17T12:01:00.000Z",
    });

    expect(
      buildNotificationQueuePatchFromStatus({
        providerMessageId: "wamid.abc",
        status: "sent",
        timestamp: "2026-08-17T12:00:00.000Z",
        errorCode: null,
        errorMessage: null,
      }),
    ).toEqual({});
  });
});

describe("R) assinatura inválida do webhook", () => {
  beforeEach(() => {
    vi.stubEnv("META_APP_SECRET", APP_SECRET);
    vi.mocked(applyWhatsAppStatusEvent).mockClear();
  });

  it("rejeita HMAC incorreto e não processa status", async () => {
    const rawBody = JSON.stringify(statusPayload("delivered"));
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: rawBody,
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
    });

    const response = await webhookPost(request);

    expect(response.status).toBe(401);
    expect(applyWhatsAppStatusEvent).not.toHaveBeenCalled();
    expect(
      verifyWhatsAppWebhookSignature({
        rawBody,
        signatureHeader: "sha256=deadbeef",
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("aceita HMAC válido", () => {
    const rawBody = "{\"ok\":true}";
    const digest = createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");

    expect(
      verifyWhatsAppWebhookSignature({
        rawBody,
        signatureHeader: `sha256=${digest}`,
        appSecret: APP_SECRET,
      }),
    ).toBe(true);
  });

  it("ignora mensagens de conversa (sem chatbot)", () => {
    expect(
      parseWhatsAppStatusEvents({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { messages: [{ id: "wamid.inbound", text: { body: "oi" } }] } }] }],
      }),
    ).toEqual([]);
  });
});

describe("cron WhatsApp", () => {
  it("recusa sem CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const request = new NextRequest("http://localhost/api/cron/whatsapp-notifications");
    const response = await cronGet(request);
    expect(response.status).toBe(401);
  });

  it("processa lote autenticado sem dados pessoais", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const request = new NextRequest("http://localhost/api/cron/whatsapp-notifications", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const response = await cronGet(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, claimed: 1, simulated: 1 });
    expect(JSON.stringify(json)).not.toMatch(/EAA/);
    expect(JSON.stringify(json)).not.toContain("phone");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
