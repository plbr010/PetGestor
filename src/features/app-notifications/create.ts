import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateAppNotificationInput } from "@/features/app-notifications/types";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

/**
 * Insere notificação com dedupe. Conflito em (company_id, dedupe_key) é ignorado.
 */
export async function createAppNotification(
  supabase: DbClient,
  input: CreateAppNotificationInput,
): Promise<{ created: boolean }> {
  const row = {
    company_id: input.companyId,
    user_id: input.userId ?? null,
    type: input.type,
    severity: input.severity ?? "info",
    title: input.title.slice(0, 160),
    message: input.message.slice(0, 500),
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    href: input.href ?? null,
    required_permission: input.requiredPermission ?? null,
    dedupe_key: input.dedupeKey.slice(0, 200),
    is_read: false,
    read_at: null,
  };

  const { error } = await supabase.from("app_notifications").insert(row);

  if (!error) {
    return { created: true };
  }

  // unique_violation — já existe o mesmo alerta
  if (error.code === "23505") {
    return { created: false };
  }

  console.error("[app-notifications:create]", error.message);
  return { created: false };
}

export async function createAppNotifications(
  supabase: DbClient,
  inputs: CreateAppNotificationInput[],
): Promise<void> {
  for (const input of inputs) {
    await createAppNotification(supabase, input);
  }
}
