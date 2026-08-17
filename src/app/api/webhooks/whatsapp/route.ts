import { NextResponse, type NextRequest } from "next/server";

import { applyWhatsAppStatusEvent } from "@/features/notifications/processor";
import { parseWhatsAppStatusEvents } from "@/features/notifications/whatsapp-webhook";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { isValidWebhookVerifyRequest, verifyWhatsAppWebhookSignature } from "@/lib/whatsapp/signature";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig();
  const expectedToken = config.webhookVerifyToken;

  if (!expectedToken) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (
    !isValidWebhookVerifyRequest({
      mode,
      token,
      challenge,
      expectedToken,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();
  const rawBody = await request.text();

  if (!config.appSecret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const valid = verifyWhatsAppWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    appSecret: config.appSecret,
  });

  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = parseWhatsAppStatusEvents(payload);

  for (const event of events) {
    await applyWhatsAppStatusEvent(event);
  }

  return NextResponse.json({ ok: true, processed: events.length });
}
