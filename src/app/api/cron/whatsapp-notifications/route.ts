import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCronRequest } from "@/features/notifications/cron-auth";
import { processDueNotifications } from "@/features/notifications/processor";
import { getCronSecret } from "@/lib/whatsapp/config";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleCron(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), getCronSecret())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await processDueNotifications({ limit: 25 });

  return NextResponse.json({
    ok: true,
    claimed: summary.claimed,
    sent: summary.sent,
    simulated: summary.simulated,
    failed: summary.failed,
    cancelled: summary.cancelled,
    retried: summary.retried,
  });
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
