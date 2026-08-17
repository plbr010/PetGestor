export const NOTIFICATION_TYPES = [
  "appointment_confirmation",
  "appointment_reminder_24h",
  "appointment_reminder_2h",
  "customer_same_day_reminder",
  "pet_ready",
  "employee_same_day_reminder",
  "employee_2h_reminder",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
  "simulated",
] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_RECIPIENT_TYPES = ["customer", "employee"] as const;

export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number];

export type CompanyNotificationSettings = {
  companyId: string;
  appointmentConfirmationEnabled: boolean;
  reminder24hEnabled: boolean;
  reminder2hEnabled: boolean;
  petReadyEnabled: boolean;
  customerSameDayReminderEnabled: boolean;
  employeeSameDayReminderEnabled: boolean;
  employeeReminder2hEnabled: boolean;
  sameDayReminderTime: string;
};

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<
  CompanyNotificationSettings,
  "companyId"
> = {
  appointmentConfirmationEnabled: true,
  reminder24hEnabled: true,
  reminder2hEnabled: true,
  petReadyEnabled: true,
  customerSameDayReminderEnabled: true,
  employeeSameDayReminderEnabled: true,
  employeeReminder2hEnabled: true,
  sameDayReminderTime: "08:00",
};

export type AppointmentNotificationContext = {
  appointmentId: string;
  companyId: string;
  companyName: string;
  customerId: string;
  petId: string;
  employeeId: string | null;
  employeeName: string | null;
  employeePhone: string | null;
  scheduledStart: string;
  status: string;
  customerName: string;
  customerPhone: string;
  petName: string;
  serviceName: string;
};

export type NotificationRowDraft = {
  company_id: string;
  customer_id: string;
  pet_id: string;
  appointment_id: string | null;
  service_order_id: string | null;
  employee_id: string | null;
  recipient_type: NotificationRecipientType;
  type: NotificationType;
  destination_phone: string;
  message_body: string;
  scheduled_for: string;
  status: "pending";
};

export type NotificationHistoryItem = {
  id: string;
  recipientType: NotificationRecipientType;
  recipientName: string;
  petName: string;
  serviceName: string;
  type: NotificationType;
  scheduledFor: string;
  status: NotificationStatus;
  lastError: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
};

export type DueNotification = {
  id: string;
  companyId: string;
  type: NotificationType;
  recipientType: NotificationRecipientType;
  destinationPhone: string;
  messageBody: string;
  scheduledFor: string;
  status: NotificationStatus;
};
