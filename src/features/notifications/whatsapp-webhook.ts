import { sanitizeWhatsAppError } from "@/lib/whatsapp/errors";
import type { WhatsAppStatusEvent } from "@/lib/whatsapp/types";
import type { Database } from "@/types/database.types";

type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number | string; title?: string; message?: string }>;
};

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: WhatsAppWebhookStatus[];
        messages?: unknown[];
      };
    }>;
  }>;
};

export function parseWhatsAppStatusEvents(body: unknown): WhatsAppStatusEvent[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const payload = body as WhatsAppWebhookBody;

  if (payload.object !== "whatsapp_business_account") {
    return [];
  }

  const events: WhatsAppStatusEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) {
          continue;
        }

        const mapped = mapProviderStatus(status.status);
        if (!mapped) {
          continue;
        }

        const firstError = status.errors?.[0];

        events.push({
          providerMessageId: status.id,
          status: mapped,
          timestamp: status.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : null,
          errorCode: firstError?.code != null ? String(firstError.code) : null,
          errorMessage: firstError?.message ?? firstError?.title ?? null,
        });
      }
    }
  }

  return events;
}

function mapProviderStatus(
  status: string,
): WhatsAppStatusEvent["status"] | null {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function buildNotificationQueuePatchFromStatus(
  event: WhatsAppStatusEvent,
): Database["public"]["Tables"]["notification_queue"]["Update"] {
  const occurredAt = event.timestamp ?? new Date().toISOString();
  const patch: Database["public"]["Tables"]["notification_queue"]["Update"] = {};

  if (event.status === "delivered") {
    patch.delivered_at = occurredAt;
  }

  if (event.status === "read") {
    patch.read_at = occurredAt;
    patch.delivered_at = occurredAt;
  }

  if (event.status === "failed") {
    patch.status = "failed";
    patch.failed_at = occurredAt;
    patch.provider_error_code = event.errorCode;
    patch.provider_error_message = sanitizeWhatsAppError(event.errorMessage ?? undefined);
    patch.last_error = sanitizeWhatsAppError(event.errorMessage ?? "whatsapp_failed");
  }

  return patch;
}
