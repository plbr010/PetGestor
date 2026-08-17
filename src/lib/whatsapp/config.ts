import "server-only";

import { z } from "zod";

import type { WhatsAppConfig, WhatsAppTemplateKey } from "@/lib/whatsapp/types";

const optionalNonEmpty = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const booleanFlag = z
  .enum(["true", "false"])
  .optional()
  .default("false")
  .transform((value) => value === "true");

const whatsappEnvSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: optionalNonEmpty,
  WHATSAPP_PHONE_NUMBER_ID: optionalNonEmpty,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalNonEmpty,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalNonEmpty,
  META_APP_SECRET: optionalNonEmpty,
  META_GRAPH_API_VERSION: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      const raw = value && value.length > 0 ? value : "v22.0";
      return raw.startsWith("v") ? raw : `v${raw}`;
    }),
  WHATSAPP_SEND_ENABLED: booleanFlag,
  WHATSAPP_TEMPLATE_LANGUAGE: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "pt_BR")),
  WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY: optionalNonEmpty,
  WHATSAPP_TEMPLATE_CUSTOMER_2H: optionalNonEmpty,
  WHATSAPP_TEMPLATE_PET_READY: optionalNonEmpty,
  WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY: optionalNonEmpty,
  WHATSAPP_TEMPLATE_EMPLOYEE_2H: optionalNonEmpty,
  WHATSAPP_TEMPLATE_CONFIRMATION: optionalNonEmpty,
  WHATSAPP_TEMPLATE_CUSTOMER_24H: optionalNonEmpty,
  WHATSAPP_TEST_RECIPIENT: optionalNonEmpty,
  CRON_SECRET: optionalNonEmpty,
});

function readWhatsAppEnvSource() {
  return {
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
    WHATSAPP_SEND_ENABLED: process.env.WHATSAPP_SEND_ENABLED,
    WHATSAPP_TEMPLATE_LANGUAGE: process.env.WHATSAPP_TEMPLATE_LANGUAGE,
    WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY: process.env.WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY,
    WHATSAPP_TEMPLATE_CUSTOMER_2H: process.env.WHATSAPP_TEMPLATE_CUSTOMER_2H,
    WHATSAPP_TEMPLATE_PET_READY: process.env.WHATSAPP_TEMPLATE_PET_READY,
    WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY: process.env.WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY,
    WHATSAPP_TEMPLATE_EMPLOYEE_2H: process.env.WHATSAPP_TEMPLATE_EMPLOYEE_2H,
    WHATSAPP_TEMPLATE_CONFIRMATION: process.env.WHATSAPP_TEMPLATE_CONFIRMATION,
    WHATSAPP_TEMPLATE_CUSTOMER_24H: process.env.WHATSAPP_TEMPLATE_CUSTOMER_24H,
    WHATSAPP_TEST_RECIPIENT: process.env.WHATSAPP_TEST_RECIPIENT,
    CRON_SECRET: process.env.CRON_SECRET,
  };
}

export function getWhatsAppEnv() {
  return whatsappEnvSchema.parse(readWhatsAppEnvSource());
}

const DEFAULT_TEMPLATE_NAMES: Record<WhatsAppTemplateKey, string> = {
  customer_same_day_reminder: "petgestor_customer_same_day",
  appointment_reminder_2h: "petgestor_customer_2h",
  pet_ready: "petgestor_pet_ready",
  employee_same_day_reminder: "petgestor_employee_same_day",
  employee_2h_reminder: "petgestor_employee_2h",
  appointment_confirmation: "petgestor_customer_confirmation",
  appointment_reminder_24h: "petgestor_customer_24h",
};

export function getWhatsAppConfig(): WhatsAppConfig {
  const env = getWhatsAppEnv();

  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    graphApiVersion: env.META_GRAPH_API_VERSION,
    language: env.WHATSAPP_TEMPLATE_LANGUAGE,
    sendEnabled: env.WHATSAPP_SEND_ENABLED,
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    appSecret: env.META_APP_SECRET,
    testRecipient: env.WHATSAPP_TEST_RECIPIENT,
    templateNames: {
      customer_same_day_reminder:
        env.WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY ??
        DEFAULT_TEMPLATE_NAMES.customer_same_day_reminder,
      appointment_reminder_2h:
        env.WHATSAPP_TEMPLATE_CUSTOMER_2H ?? DEFAULT_TEMPLATE_NAMES.appointment_reminder_2h,
      pet_ready: env.WHATSAPP_TEMPLATE_PET_READY ?? DEFAULT_TEMPLATE_NAMES.pet_ready,
      employee_same_day_reminder:
        env.WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY ??
        DEFAULT_TEMPLATE_NAMES.employee_same_day_reminder,
      employee_2h_reminder:
        env.WHATSAPP_TEMPLATE_EMPLOYEE_2H ?? DEFAULT_TEMPLATE_NAMES.employee_2h_reminder,
      appointment_confirmation: env.WHATSAPP_TEMPLATE_CONFIRMATION,
      appointment_reminder_24h: env.WHATSAPP_TEMPLATE_CUSTOMER_24H,
    },
  };
}

export function isWhatsAppConfigured(): boolean {
  const config = getWhatsAppConfig();
  return Boolean(config.accessToken && config.phoneNumberId);
}

export function getWhatsAppMessagesUrl(config: WhatsAppConfig = getWhatsAppConfig()): string {
  return `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
}

export function getTemplateNameForType(
  type: WhatsAppTemplateKey,
  config: WhatsAppConfig = getWhatsAppConfig(),
): string | null {
  return config.templateNames[type] ?? null;
}

export function getCronSecret(): string | undefined {
  return getWhatsAppEnv().CRON_SECRET;
}
