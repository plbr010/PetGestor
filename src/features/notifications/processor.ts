import "server-only";

import {
  computeNextAttemptAt,
  decideNotificationSend,
  isTypeEnabledBySettings,
} from "@/features/notifications/send-policy";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/features/notifications/types";
import type { NotificationType } from "@/features/notifications/types";
import { buildNotificationQueuePatchFromStatus } from "@/features/notifications/whatsapp-webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { getTemplateNameForType, getWhatsAppConfig } from "@/lib/whatsapp/config";
import { sanitizeWhatsAppError } from "@/lib/whatsapp/errors";
import { buildWhatsAppTemplateParameters } from "@/lib/whatsapp/templates";
import type { SendWhatsAppTemplateInput, WhatsAppSendResult, WhatsAppTemplateKey } from "@/lib/whatsapp/types";
import type { Database } from "@/types/database.types";

export type ClaimedNotification = {
  id: string;
  company_id: string;
  type: NotificationType;
  recipient_type: "customer" | "employee";
  destination_phone: string;
  scheduled_for: string;
  appointment_id: string | null;
  service_order_id: string | null;
  attempts: number;
  max_attempts: number;
  status: string;
  claimed_at: string | null;
};

export type ProcessNotificationsSummary = {
  claimed: number;
  sent: number;
  simulated: number;
  failed: number;
  cancelled: number;
  retried: number;
};

type NotificationQueueUpdate = Database["public"]["Tables"]["notification_queue"]["Update"];

type ProcessorDeps = {
  claim: (limit: number, now: Date) => Promise<ClaimedNotification[]>;
  loadContext: (row: ClaimedNotification) => Promise<ProcessorContext>;
  send: (input: SendWhatsAppTemplateInput) => Promise<WhatsAppSendResult>;
  update: (row: ClaimedNotification, patch: NotificationQueueUpdate) => Promise<void>;
};

export type ProcessorContext = {
  settingsEnabled: boolean;
  appointmentStatus: string | null;
  appointmentStart: string | null;
  appointmentDeleted: boolean;
  timeZone: string;
  tutorName: string;
  petName: string;
  serviceName: string;
  companyName: string;
  employeeName: string;
};

const DEFAULT_BATCH = 25;

export async function processDueNotifications(options?: {
  now?: Date;
  limit?: number;
  deps?: Partial<ProcessorDeps>;
}): Promise<ProcessNotificationsSummary> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? DEFAULT_BATCH;
  const deps = { ...createDefaultDeps(), ...options?.deps };

  const claimed = await deps.claim(limit, now);
  return processClaimedNotifications(claimed, deps, now);
}

export async function processClaimedNotifications(
  claimed: ClaimedNotification[],
  deps: ProcessorDeps,
  now: Date,
): Promise<ProcessNotificationsSummary> {
  const summary: ProcessNotificationsSummary = {
    claimed: claimed.length,
    sent: 0,
    simulated: 0,
    failed: 0,
    cancelled: 0,
    retried: 0,
  };

  for (const row of claimed) {
    const outcome = await processOne(row, deps, now);
    summary[outcome] += 1;
  }

  return summary;
}

async function processOne(
  row: ClaimedNotification,
  deps: ProcessorDeps,
  now: Date,
): Promise<"sent" | "simulated" | "failed" | "cancelled" | "retried"> {
  const context = await deps.loadContext(row);
  const decision = decideNotificationSend({
    type: row.type,
    scheduledFor: row.scheduled_for,
    destinationPhone: row.destination_phone,
    now,
    settingsEnabled: context.settingsEnabled,
    appointmentStatus: context.appointmentStatus,
    appointmentStart: context.appointmentStart,
    appointmentDeleted: context.appointmentDeleted,
  });

  if (decision.action === "cancel") {
    await deps.update(row, {
      status: "cancelled",
      last_error: decision.reason,
      claimed_at: null,
    });
    return "cancelled";
  }

  if (decision.action === "fail") {
    await deps.update(row, {
      status: "failed",
      failed_at: now.toISOString(),
      last_error: decision.reason,
      provider_error_code: decision.reason,
      provider_error_message: decision.reason,
      claimed_at: null,
    });
    return "failed";
  }

  const templateName = getTemplateNameForType(row.type as WhatsAppTemplateKey);

  if (!templateName) {
    await deps.update(row, {
      status: "cancelled",
      last_error: "template_not_configured",
      claimed_at: null,
    });
    return "cancelled";
  }

  const parameters = buildWhatsAppTemplateParameters(row.type, {
    tutorName: context.tutorName,
    petName: context.petName,
    serviceName: context.serviceName,
    companyName: context.companyName,
    employeeName: context.employeeName,
    appointmentStartUtcIso: context.appointmentStart ?? row.scheduled_for,
    timeZone: context.timeZone,
  });

  if (!parameters) {
    await deps.update(row, {
      status: "failed",
      failed_at: now.toISOString(),
      last_error: "template_not_configured",
      claimed_at: null,
    });
    return "failed";
  }

  const result = await deps.send({
    to: row.destination_phone,
    template: templateName,
    language: getWhatsAppConfig().language,
    parameters,
  });

  if (result.ok && result.simulated) {
    await deps.update(row, {
      status: "simulated",
      last_error: "whatsapp_send_disabled",
      claimed_at: null,
    });
    return "simulated";
  }

  if (result.ok) {
    await deps.update(row, {
      status: "sent",
      provider: "whatsapp",
      provider_message_id: result.messageId,
      accepted_at: now.toISOString(),
      sent_at: now.toISOString(),
      last_error: null,
      claimed_at: null,
    });
    return "sent";
  }

  const sanitizedError = sanitizeWhatsAppError(result.errorMessage);

  if (result.retryable && row.attempts < row.max_attempts) {
    await deps.update(row, {
      status: "pending",
      next_attempt_at: computeNextAttemptAt(row.attempts, now).toISOString(),
      last_error: sanitizedError,
      provider_error_code: result.errorCode,
      provider_error_message: sanitizedError,
      claimed_at: null,
    });
    return "retried";
  }

  await deps.update(row, {
    status: "failed",
    failed_at: now.toISOString(),
    last_error: sanitizedError,
    provider_error_code: result.errorCode,
    provider_error_message: sanitizedError,
    claimed_at: null,
  });
  return "failed";
}

function createDefaultDeps(): ProcessorDeps {
  return {
    claim: claimDueNotifications,
    loadContext: loadProcessorContext,
    send: sendWhatsAppTemplate,
    update: updateNotificationRow,
  };
}

export async function claimDueNotifications(
  limit: number,
  now: Date,
): Promise<ClaimedNotification[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_due_notifications", {
    p_limit: limit,
    p_now: now.toISOString(),
  });

  if (error || !data) {
    return [];
  }

  return data as ClaimedNotification[];
}

async function updateNotificationRow(
  row: ClaimedNotification,
  patch: NotificationQueueUpdate,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("notification_queue")
    .update(patch)
    .eq("id", row.id)
    .eq("company_id", row.company_id)
    .eq("status", "processing");

  if (row.claimed_at) {
    query = query.eq("claimed_at", row.claimed_at);
  }

  await query;
}

async function loadProcessorContext(row: ClaimedNotification): Promise<ProcessorContext> {
  const supabase = createSupabaseAdminClient();
  const { data: settingsRow } = await supabase
    .from("company_notification_settings")
    .select("*")
    .eq("company_id", row.company_id)
    .maybeSingle();

  const settings = settingsRow
    ? {
        appointmentConfirmationEnabled: settingsRow.appointment_confirmation_enabled,
        reminder24hEnabled: settingsRow.reminder_24h_enabled,
        reminder2hEnabled: settingsRow.reminder_2h_enabled,
        petReadyEnabled: settingsRow.pet_ready_enabled,
        customerSameDayReminderEnabled: settingsRow.customer_same_day_reminder_enabled,
        employeeSameDayReminderEnabled: settingsRow.employee_same_day_reminder_enabled,
        employeeReminder2hEnabled: settingsRow.employee_reminder_2h_enabled,
      }
    : DEFAULT_NOTIFICATION_SETTINGS;
  const { data: company } = await supabase
    .from("companies")
    .select("name, timezone")
    .eq("id", row.company_id)
    .maybeSingle();

  let appointmentStatus: string | null = null;
  let appointmentStart: string | null = null;
  let appointmentDeleted = false;
  let tutorName = "";
  let petName = "";
  let serviceName = "";
  let employeeName = "";

  if (row.appointment_id) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select(
        "status, scheduled_start, deleted_at, service_name_snapshot, customers(name), pets(name), employees(name)",
      )
      .eq("id", row.appointment_id)
      .eq("company_id", row.company_id)
      .maybeSingle();

    if (!appointment) {
      appointmentDeleted = true;
    } else {
      appointmentStatus = appointment.status;
      appointmentStart = appointment.scheduled_start;
      appointmentDeleted = Boolean(appointment.deleted_at);
      serviceName = appointment.service_name_snapshot;
      const customer = unwrap(appointment.customers as { name: string } | { name: string }[] | null);
      const pet = unwrap(appointment.pets as { name: string } | { name: string }[] | null);
      const employee = unwrap(appointment.employees as { name: string } | { name: string }[] | null);
      tutorName = customer?.name ?? "";
      petName = pet?.name ?? "";
      employeeName = employee?.name ?? "";
    }
  } else if (row.service_order_id) {
    const { data: order } = await supabase
      .from("service_orders")
      .select(
        "status, appointments(status, scheduled_start, service_name_snapshot, customers(name), pets(name), employees(name))",
      )
      .eq("id", row.service_order_id)
      .eq("company_id", row.company_id)
      .maybeSingle();

    const appointment = unwrap(
      order?.appointments as
        | {
            status: string;
            scheduled_start: string;
            service_name_snapshot: string;
            customers: { name: string } | { name: string }[];
            pets: { name: string } | { name: string }[];
            employees: { name: string } | { name: string }[];
          }
        | {
            status: string;
            scheduled_start: string;
            service_name_snapshot: string;
            customers: { name: string } | { name: string }[];
            pets: { name: string } | { name: string }[];
            employees: { name: string } | { name: string }[];
          }[]
        | null,
    );

    if (order?.status === "cancelled") {
      appointmentStatus = "cancelled";
    } else if (appointment) {
      appointmentStatus = appointment.status;
      appointmentStart = appointment.scheduled_start;
      serviceName = appointment.service_name_snapshot;
      tutorName = unwrap(appointment.customers)?.name ?? "";
      petName = unwrap(appointment.pets)?.name ?? "";
      employeeName = unwrap(appointment.employees)?.name ?? "";
    }
  }

  return {
    settingsEnabled: isTypeEnabledBySettings(row.type, settings),
    appointmentStatus,
    appointmentStart,
    appointmentDeleted,
    timeZone: company?.timezone ?? "America/Sao_Paulo",
    tutorName,
    petName,
    serviceName,
    companyName: company?.name ?? "Pet shop",
    employeeName,
  };
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function applyWhatsAppStatusEvent(event: {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const patch = buildNotificationQueuePatchFromStatus(event);

  if (Object.keys(patch).length === 0) {
    return true;
  }

  const { data, error } = await supabase
    .from("notification_queue")
    .update(patch)
    .eq("provider_message_id", event.providerMessageId)
    .select("id")
    .maybeSingle();

  return Boolean(data) && !error;
}
