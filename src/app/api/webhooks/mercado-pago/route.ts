import { NextResponse, type NextRequest } from "next/server";

import {
  markWebhookEventProcessed,
  recordWebhookEvent,
} from "@/features/subscription/billing-repository";
import { verifyMercadoPagoWebhookSignature } from "@/features/subscription/providers/mercado-pago-webhook";
import { MERCADO_PAGO_PROVIDER } from "@/features/subscription/providers/mercado-pago-types";
import {
  syncAuthorizedPaymentFromProvider,
  syncPaymentFromProvider,
  syncSubscriptionFromProvider,
} from "@/features/subscription/sync";
import {
  buildWebhookProviderEventId,
  decideWebhookReplay,
  resolveWebhookDataId,
} from "@/features/subscription/webhook-policy";
import { BillingConfigError, getMercadoPagoWebhookSecret } from "@/lib/env/server-env";

type MercadoPagoWebhookBody = {
  id?: number | string;
  type?: string;
  action?: string;
  data?: {
    id?: string;
  };
};

export async function POST(request: NextRequest) {
  let eventRecordId: string | null = null;

  try {
    const queryDataId = request.nextUrl.searchParams.get("data.id");
    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");

    let secret: string;
    try {
      secret = getMercadoPagoWebhookSecret();
    } catch (error) {
      if (error instanceof BillingConfigError) {
        return NextResponse.json({ error: "webhook_not_configured" }, { status: 401 });
      }
      throw error;
    }

    const rawBody = await request.text();
    let body: MercadoPagoWebhookBody = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as MercadoPagoWebhookBody;
      } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      }
    }

    const dataId = resolveWebhookDataId(queryDataId, body.data?.id ?? null);

    if (
      !verifyMercadoPagoWebhookSignature({
        xSignature,
        xRequestId,
        dataId,
        secret,
      })
    ) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    const eventType = body.type ?? "unknown";
    const action = body.action ?? null;
    const resourceId = body.data?.id ?? dataId ?? null;
    const providerEventId = buildWebhookProviderEventId({
      xRequestId,
      eventType,
      resourceId,
      action,
    });

    const recorded = await recordWebhookEvent({
      provider: MERCADO_PAGO_PROVIDER,
      provider_event_id: providerEventId,
      event_type: eventType,
      action,
      resource_id: resourceId,
    });

    if (recorded.duplicate || decideWebhookReplay(recorded.processingStatus) === "duplicate") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    eventRecordId = recorded.id;

    if (!resourceId) {
      if (eventRecordId) {
        await markWebhookEventProcessed(eventRecordId, "ignored", "missing_resource_id");
      }
      return NextResponse.json({ ok: true });
    }

    switch (eventType) {
      case "subscription_preapproval":
        await syncSubscriptionFromProvider({ providerSubscriptionId: String(resourceId) });
        break;
      case "subscription_authorized_payment":
        await syncAuthorizedPaymentFromProvider(String(resourceId));
        break;
      case "payment":
        await syncPaymentFromProvider(String(resourceId));
        break;
      default:
        if (eventRecordId) {
          await markWebhookEventProcessed(eventRecordId, "ignored", `unsupported_event:${eventType}`);
        }
        return NextResponse.json({ ok: true });
    }

    if (eventRecordId) {
      await markWebhookEventProcessed(eventRecordId, "processed");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (eventRecordId) {
      await markWebhookEventProcessed(
        eventRecordId,
        "failed",
        error instanceof Error ? error.message : "webhook_processing_failed",
      );
    }

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
