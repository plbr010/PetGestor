"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeSameDayReminderTime } from "@/features/notifications/scheduler";
import type { NotificationType } from "@/features/notifications/types";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationSettingsActionState = {
  error?: string;
  success?: string;
};

const notificationSettingsSchema = z.object({
  appointmentConfirmationEnabled: z.boolean(),
  reminder24hEnabled: z.boolean(),
  reminder2hEnabled: z.boolean(),
  petReadyEnabled: z.boolean(),
  customerSameDayReminderEnabled: z.boolean(),
  employeeSameDayReminderEnabled: z.boolean(),
  employeeReminder2hEnabled: z.boolean(),
  sameDayReminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
});

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

export async function updateNotificationSettingsAction(
  _prevState: NotificationSettingsActionState,
  formData: FormData,
): Promise<NotificationSettingsActionState> {
  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;

  const parsed = notificationSettingsSchema.safeParse({
    appointmentConfirmationEnabled: parseCheckbox(
      formData.get("appointmentConfirmationEnabled"),
    ),
    reminder24hEnabled: parseCheckbox(formData.get("reminder24hEnabled")),
    reminder2hEnabled: parseCheckbox(formData.get("reminder2hEnabled")),
    petReadyEnabled: parseCheckbox(formData.get("petReadyEnabled")),
    customerSameDayReminderEnabled: parseCheckbox(
      formData.get("customerSameDayReminderEnabled"),
    ),
    employeeSameDayReminderEnabled: parseCheckbox(
      formData.get("employeeSameDayReminderEnabled"),
    ),
    employeeReminder2hEnabled: parseCheckbox(
      formData.get("employeeReminder2hEnabled"),
    ),
    sameDayReminderTime: normalizeSameDayReminderTime(
      String(formData.get("sameDayReminderTime") ?? "08:00"),
    ),
  });

  if (!parsed.success) {
    return { error: "Configurações inválidas." };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("company_notification_settings").upsert(
    {
      company_id: companyId,
      appointment_confirmation_enabled: parsed.data.appointmentConfirmationEnabled,
      reminder_24h_enabled: parsed.data.reminder24hEnabled,
      reminder_2h_enabled: parsed.data.reminder2hEnabled,
      pet_ready_enabled: parsed.data.petReadyEnabled,
      customer_same_day_reminder_enabled: parsed.data.customerSameDayReminderEnabled,
      employee_same_day_reminder_enabled: parsed.data.employeeSameDayReminderEnabled,
      employee_reminder_2h_enabled: parsed.data.employeeReminder2hEnabled,
      same_day_reminder_time: parsed.data.sameDayReminderTime,
    },
    { onConflict: "company_id" },
  );

  if (error) {
    return { error: "Não foi possível salvar as configurações." };
  }

  const disabledTypes: NotificationType[] = [];
  if (!parsed.data.appointmentConfirmationEnabled) disabledTypes.push("appointment_confirmation");
  if (!parsed.data.reminder24hEnabled) disabledTypes.push("appointment_reminder_24h");
  if (!parsed.data.reminder2hEnabled) disabledTypes.push("appointment_reminder_2h");
  if (!parsed.data.petReadyEnabled) disabledTypes.push("pet_ready");
  if (!parsed.data.customerSameDayReminderEnabled) {
    disabledTypes.push("customer_same_day_reminder");
  }
  if (!parsed.data.employeeSameDayReminderEnabled) {
    disabledTypes.push("employee_same_day_reminder");
  }
  if (!parsed.data.employeeReminder2hEnabled) disabledTypes.push("employee_2h_reminder");

  if (disabledTypes.length > 0) {
    await supabase
      .from("notification_queue")
      .update({ status: "cancelled", last_error: "automation_disabled" })
      .eq("company_id", companyId)
      .eq("status", "pending")
      .in("type", disabledTypes);
  }

  revalidatePath("/dashboard/configuracoes");
  return { success: "Configuração salva." };
}
