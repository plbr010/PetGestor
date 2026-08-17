export const NOTIFICATION_TYPES = [
  "appointment_confirmation",
  "appointment_reminder_24h",
  "appointment_reminder_2h",
  "pet_ready",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export type CompanyNotificationSettings = {
  companyId: string;
  appointmentConfirmationEnabled: boolean;
  reminder24hEnabled: boolean;
  reminder2hEnabled: boolean;
  petReadyEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<
  CompanyNotificationSettings,
  "companyId"
> = {
  appointmentConfirmationEnabled: true,
  reminder24hEnabled: true,
  reminder2hEnabled: true,
  petReadyEnabled: true,
};

export type AppointmentNotificationContext = {
  appointmentId: string;
  companyId: string;
  customerId: string;
  petId: string;
  scheduledStart: string;
  status: string;
  customerName: string;
  customerPhone: string;
  petName: string;
};

export type NotificationRowDraft = {
  company_id: string;
  customer_id: string;
  pet_id: string;
  appointment_id: string | null;
  service_order_id: string | null;
  type: NotificationType;
  destination_phone: string;
  message_body: string;
  scheduled_for: string;
  status: "pending";
};

export type NotificationHistoryItem = {
  id: string;
  customerName: string;
  petName: string;
  type: NotificationType;
  scheduledFor: string;
  status: NotificationStatus;
};
