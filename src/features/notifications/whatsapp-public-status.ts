import "server-only";

import { getWhatsAppConfig, isWhatsAppConfigured } from "@/lib/whatsapp/config";
import type { WhatsAppPublicStatus } from "@/features/notifications/messaging-ux";

export function getWhatsAppPublicStatus(): WhatsAppPublicStatus & { canSendTest: boolean } {
  const config = getWhatsAppConfig();

  return {
    configured: isWhatsAppConfigured(),
    sendEnabled: config.sendEnabled,
    checkedAt: new Date().toISOString(),
    canSendTest: Boolean(config.testRecipient),
  };
}
