"use server";

import { revalidatePath } from "next/cache";

import { parseTimeBlockForm } from "@/features/appointments/time-blocks/schemas";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localDateTimeToUtcIso } from "@/lib/timezone";

export type TimeBlockActionState = {
  error?: string;
  success?: string;
};

export async function createTimeBlockAction(
  _prevState: TimeBlockActionState,
  formData: FormData,
): Promise<TimeBlockActionState> {
  const context = await requireCompanyContext();
  const timeZone = context.membership.company.timezone;
  const parsed = parseTimeBlockForm(formData, timeZone);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const blockStart = localDateTimeToUtcIso(
    parsed.data.date,
    parsed.data.startTime,
    timeZone,
  );
  const blockEnd = localDateTimeToUtcIso(parsed.data.date, parsed.data.endTime, timeZone);

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("schedule_time_blocks").insert({
    company_id: context.membership.company.id,
    employee_id: parsed.data.employeeId,
    block_start: blockStart,
    block_end: blockEnd,
    reason: parsed.data.reason,
    created_by: context.user.id,
  });

  if (error) {
    return { error: "Não foi possível criar o bloqueio." };
  }

  revalidatePath("/dashboard/agenda");
  return { success: "Horário bloqueado com sucesso." };
}

export async function removeTimeBlockAction(blockId: string): Promise<TimeBlockActionState> {
  if (!isValidUuid(blockId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schedule_time_blocks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", blockId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/agenda");
  return { success: "Bloqueio removido." };
}
