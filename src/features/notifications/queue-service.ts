import {
  buildAppointmentNotificationRows,
  buildPetReadyNotificationRow,
} from "@/features/notifications/build-queue-rows";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type CompanyNotificationSettings,
  type NotificationHistoryItem,
} from "@/features/notifications/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SettingsRow = Database["public"]["Tables"]["company_notification_settings"]["Row"];

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapSettingsRow(row: SettingsRow): CompanyNotificationSettings {
  return {
    companyId: row.company_id,
    appointmentConfirmationEnabled: row.appointment_confirmation_enabled,
    reminder24hEnabled: row.reminder_24h_enabled,
    reminder2hEnabled: row.reminder_2h_enabled,
    petReadyEnabled: row.pet_ready_enabled,
  };
}

export async function getCompanyNotificationSettings(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyNotificationSettings> {
  const { data } = await supabase
    .from("company_notification_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) {
    return { companyId, ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  return mapSettingsRow(data);
}

async function loadAppointmentNotificationContext(
  supabase: SupabaseClient,
  companyId: string,
  appointmentId: string,
) {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      company_id,
      customer_id,
      pet_id,
      scheduled_start,
      status,
      customers!inner(name, phone),
      pets!inner(name)
    `,
    )
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const customer = unwrapJoin(
    data.customers as { name: string; phone: string } | { name: string; phone: string }[],
  );
  const pet = unwrapJoin(data.pets as { name: string } | { name: string }[]);

  if (!customer || !pet) {
    return null;
  }

  return {
    appointmentId: data.id,
    companyId: data.company_id,
    customerId: data.customer_id,
    petId: data.pet_id,
    scheduledStart: data.scheduled_start,
    status: data.status,
    customerName: customer.name,
    customerPhone: customer.phone,
    petName: pet.name,
  };
}

export async function cancelPendingAppointmentNotifications(
  supabase: SupabaseClient,
  companyId: string,
  appointmentId: string,
): Promise<void> {
  await supabase
    .from("notification_queue")
    .update({ status: "cancelled" })
    .eq("company_id", companyId)
    .eq("appointment_id", appointmentId)
    .in("status", ["pending", "processing"]);
}

async function insertNotificationRows(
  supabase: SupabaseClient,
  rows: ReturnType<typeof buildAppointmentNotificationRows>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  for (const row of rows) {
    await supabase.from("notification_queue").insert(row);
  }
}

export async function syncAppointmentNotifications(
  supabase: SupabaseClient,
  companyId: string,
  appointmentId: string,
  timeZone: string,
): Promise<void> {
  const context = await loadAppointmentNotificationContext(
    supabase,
    companyId,
    appointmentId,
  );

  if (!context) {
    return;
  }

  await cancelPendingAppointmentNotifications(supabase, companyId, appointmentId);

  const settings = await getCompanyNotificationSettings(supabase, companyId);
  const rows = buildAppointmentNotificationRows({
    context,
    settings,
    timeZone,
  });

  await insertNotificationRows(supabase, rows);
}

export async function cancelAppointmentNotificationsForStatusChange(
  supabase: SupabaseClient,
  companyId: string,
  appointmentId: string,
): Promise<void> {
  await cancelPendingAppointmentNotifications(supabase, companyId, appointmentId);
}

export async function enqueuePetReadyNotification(
  supabase: SupabaseClient,
  companyId: string,
  serviceOrderId: string,
  timeZone: string,
): Promise<void> {
  const settings = await getCompanyNotificationSettings(supabase, companyId);

  if (!settings.petReadyEnabled) {
    return;
  }

  const { data, error } = await supabase
    .from("service_orders")
    .select(
      `
      id,
      company_id,
      appointments!inner(
        customer_id,
        pet_id,
        customers!inner(name, phone),
        pets!inner(name)
      )
    `,
    )
    .eq("id", serviceOrderId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  const appointment = unwrapJoin(
    data.appointments as
      | {
          customer_id: string;
          pet_id: string;
          customers: { name: string; phone: string } | { name: string; phone: string }[];
          pets: { name: string } | { name: string }[];
        }
      | {
          customer_id: string;
          pet_id: string;
          customers: { name: string; phone: string } | { name: string; phone: string }[];
          pets: { name: string } | { name: string }[];
        }[],
  );

  if (!appointment) {
    return;
  }

  const customer = unwrapJoin(appointment.customers);
  const pet = unwrapJoin(appointment.pets);

  if (!customer || !pet) {
    return;
  }

  const row = buildPetReadyNotificationRow({
    companyId,
    customerId: appointment.customer_id,
    petId: appointment.pet_id,
    serviceOrderId: data.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    petName: pet.name,
    timeZone,
  });

  if (!row) {
    return;
  }

  await supabase.from("notification_queue").insert(row);
}

export async function listNotificationHistory(
  supabase: SupabaseClient,
  companyId: string,
  limit = 50,
): Promise<NotificationHistoryItem[]> {
  const { data, error } = await supabase
    .from("notification_queue")
    .select(
      `
      id,
      type,
      scheduled_for,
      status,
      customers(name),
      pets(name)
    `,
    )
    .eq("company_id", companyId)
    .order("scheduled_for", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const customer = unwrapJoin(row.customers as { name: string } | { name: string }[]);
    const pet = unwrapJoin(row.pets as { name: string } | { name: string }[]);

    return {
      id: row.id,
      customerName: customer?.name ?? "—",
      petName: pet?.name ?? "—",
      type: row.type as NotificationHistoryItem["type"],
      scheduledFor: row.scheduled_for,
      status: row.status as NotificationHistoryItem["status"],
    };
  });
}
