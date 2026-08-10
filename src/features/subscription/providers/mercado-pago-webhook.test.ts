import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyMercadoPagoWebhookSignature } from "@/features/subscription/providers/mercado-pago-webhook";

describe("verifyMercadoPagoWebhookSignature", () => {
  it("rejeita assinatura inválida", () => {
    const valid = verifyMercadoPagoWebhookSignature({
      xSignature: "ts=123,v1=invalid",
      xRequestId: "req-1",
      dataId: "abc123",
      secret: "test-secret",
    });

    expect(valid).toBe(false);
  });

  it("aceita assinatura válida HMAC", () => {
    const secret = "webhook-secret";
    const ts = "1704908010";
    const dataId = "abc123";
    const xRequestId = "req-456";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");

    expect(
      verifyMercadoPagoWebhookSignature({
        xSignature: `ts=${ts},v1=${v1}`,
        xRequestId,
        dataId,
        secret,
      }),
    ).toBe(true);
  });
});
