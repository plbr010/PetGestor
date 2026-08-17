import "server-only";

import { getTemplateNameForType, getWhatsAppConfig, getWhatsAppMessagesUrl } from "@/lib/whatsapp/config";
import { extractGraphError, isRetryableWhatsAppFailure, sanitizeWhatsAppError } from "@/lib/whatsapp/errors";
import { toWhatsAppRecipient } from "@/lib/whatsapp/templates";
import type {
  SendWhatsAppTemplateInput,
  WhatsAppSendResult,
  WhatsAppTemplateKey,
} from "@/lib/whatsapp/types";

const REQUEST_TIMEOUT_MS = 15_000;

export async function sendWhatsAppTemplate(
  input: SendWhatsAppTemplateInput,
  options?: {
    fetchFn?: typeof fetch;
    now?: Date;
  },
): Promise<WhatsAppSendResult> {
  const config = getWhatsAppConfig();
  const fetchFn = options?.fetchFn ?? fetch;
  const to = toWhatsAppRecipient(input.to);

  if (!to) {
    return {
      ok: false,
      retryable: false,
      errorCode: "invalid_phone",
      errorMessage: "Telefone de destino inválido.",
    };
  }

  if (!config.sendEnabled) {
    return {
      ok: true,
      simulated: true,
      messageId: null,
    };
  }

  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      retryable: false,
      errorCode: "whatsapp_not_configured",
      errorMessage: "WhatsApp Cloud API não configurada.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchFn(getWhatsAppMessagesUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: input.template,
          language: { code: input.language },
          components:
            input.parameters.length > 0
              ? [
                  {
                    type: "body",
                    parameters: input.parameters,
                  },
                ]
              : [],
        },
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }> }
      | { error?: { code?: number; message?: string } }
      | null;

    if (!response.ok) {
      const graphError = extractGraphError(body);
      return {
        ok: false,
        retryable: isRetryableWhatsAppFailure({
          httpStatus: response.status,
          errorCode: graphError.code,
        }),
        errorCode: graphError.code,
        errorMessage: graphError.message,
        httpStatus: response.status,
      };
    }

    const messageId = body && "messages" in body ? (body.messages?.[0]?.id ?? null) : null;

    return {
      ok: true,
      simulated: false,
      messageId,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      retryable: true,
      errorCode: aborted ? "timeout" : "network",
      errorMessage: sanitizeWhatsAppError(
        aborted ? "Tempo esgotado ao chamar a API do WhatsApp." : "Falha de rede ao chamar a API do WhatsApp.",
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveTemplateName(type: WhatsAppTemplateKey): string | null {
  return getTemplateNameForType(type);
}
