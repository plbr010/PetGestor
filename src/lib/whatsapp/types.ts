export type WhatsAppTemplateParameter = {
  type: "text";
  text: string;
};

export type SendWhatsAppTemplateInput = {
  to: string;
  template: string;
  language: string;
  parameters: WhatsAppTemplateParameter[];
};

export type WhatsAppSendSuccess = {
  ok: true;
  simulated: boolean;
  messageId: string | null;
};

export type WhatsAppSendFailure = {
  ok: false;
  retryable: boolean;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
};

export type WhatsAppSendResult = WhatsAppSendSuccess | WhatsAppSendFailure;

export type WhatsAppTemplateKey =
  | "customer_same_day_reminder"
  | "appointment_reminder_2h"
  | "pet_ready"
  | "employee_same_day_reminder"
  | "employee_2h_reminder"
  | "appointment_confirmation"
  | "appointment_reminder_24h";

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | undefined;
  graphApiVersion: string;
  language: string;
  sendEnabled: boolean;
  webhookVerifyToken: string | undefined;
  appSecret: string | undefined;
  testRecipient: string | undefined;
  templateNames: Partial<Record<WhatsAppTemplateKey, string>>;
};

export type WhatsAppStatusEvent = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};
