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
import { getMercadoPagoWebhookSecret } from "@/lib/env/server-env";

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
    const dataId = request.nextUrl.searchParams.get("data.id");
    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");
    const secret = getMercadoPagoWebhookSecret();

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

    const body = (await request.json()) as MercadoPagoWebhookBody;
    const eventType = body.type ?? "unknown";
    const action = body.action ?? null;
    const resourceId = body.data?.id ?? dataId ?? null;
    const providerEventId = xRequestId ?? `${eventType}:${resourceId ?? "unknown"}:${action ?? "none"}`;

    const recorded = await recordWebhookEvent({
      provider: MERCADO_PAGO_PROVIDER,
      provider_event_id: providerEventId,
      event_type: eventType,
      action,
      resource_id: resourceId,
    });

    if (recorded.duplicate) {
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
