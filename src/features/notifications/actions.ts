"use server";

import { revalidatePath } from "next/cache";

import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

export type NotificationSettingsActionState = {
  error?: string;
  success?: string;
};

const notificationSettingsSchema = z.object({
  appointmentConfirmationEnabled: z.boolean(),
  reminder24hEnabled: z.boolean(),
  reminder2hEnabled: z.boolean(),
  petReadyEnabled: z.boolean(),
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
    },
    { onConflict: "company_id" },
  );

  if (error) {
    return { error: "Não foi possível salvar as configurações." };
  }

  revalidatePath("/dashboard/configuracoes");
  return { success: "Mensagens automáticas atualizadas." };
}
