"use server";

import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { isValidBrazilianPhone, toE164Brazil } from "@/lib/phone";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { buildWhatsAppTemplateParameters } from "@/lib/whatsapp/templates";

export type WhatsAppTestActionState = {
  error?: string;
  success?: string;
};

export async function sendWhatsAppAdminTestAction(
  _prevState: WhatsAppTestActionState,
  formData: FormData,
): Promise<WhatsAppTestActionState> {
  await requirePlatformAdmin();

  const config = getWhatsAppConfig();
  const authorized = config.testRecipient;

  if (!authorized) {
    return { error: "Configure WHATSAPP_TEST_RECIPIENT para o teste interno." };
  }

  const requested = String(formData.get("phone") ?? "").trim();

  if (!isValidBrazilianPhone(requested) && !isValidBrazilianPhone(authorized)) {
    return { error: "Número de teste inválido." };
  }

  const requestedE164 = isValidBrazilianPhone(requested)
    ? toE164Brazil(requested)
    : toE164Brazil(authorized);
  const authorizedE164 = toE164Brazil(authorized);

  if (requestedE164 !== authorizedE164) {
    return { error: "O número informado não é o número autorizado de teste." };
  }

  const template = config.templateNames.pet_ready;

  if (!template) {
    return { error: "Template de pet pronto não configurado." };
  }

  const result = await sendWhatsAppTemplate({
    to: authorizedE164,
    template,
    language: config.language,
    parameters: buildWhatsAppTemplateParameters("pet_ready", {
      tutorName: "Teste",
      petName: "PetGestor",
      serviceName: "Teste",
      companyName: "PetGestor",
      employeeName: "Equipe",
      appointmentStartUtcIso: new Date().toISOString(),
      timeZone: "America/Sao_Paulo",
    }) ?? [],
  });

  if (!result.ok) {
    return { error: result.errorMessage };
  }

  if (result.simulated) {
    return { success: "Simulação concluída. Nenhuma mensagem real foi enviada." };
  }

  return { success: "Pedido aceito pela Meta. Confira o WhatsApp do número de teste." };
}
