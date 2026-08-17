"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelAppointmentSchema,
  parseAppointmentForm,
  type SeriesScope,
} from "@/features/appointments/schemas";
import {
  expandRecurrenceStarts,
  formatRecurrenceSkipSummary,
  type RecurrenceFrequency,
} from "@/features/appointments/recurrence";
import { canTransitionStatus } from "@/features/appointments/status";
import { getAvailableTimeSlots } from "@/features/appointments/queries";
import { mapAppointmentError } from "@/features/appointments/utils";
import {
  cancelAppointmentNotificationsForStatusChange,
  syncAppointmentNotifications,
} from "@/features/notifications/queue-service";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localDateTimeToUtcIso } from "@/lib/timezone";
import type { AppointmentStatus, PetSize } from "@/types/database.types";

export type AppointmentActionState = {
  error?: string;
  success?: string;
};

function revalidateAgendaPaths(appointmentId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");

  if (appointmentId) {
    revalidatePath(`/dashboard/agenda/${appointmentId}`);
    revalidatePath(`/dashboard/agenda/${appointmentId}/editar`);
  }
}

function resolveIntervalValue(
  frequency: RecurrenceFrequency,
  intervalDays: number | undefined,
): number {
  if (frequency === "custom_days") {
    return intervalDays ?? 1;
  }

  return 1;
}

async function linkAppointmentToRecurrence(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string,
  appointmentId: string,
  recurrenceId: string,
  recurrenceIndex: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointments")
    .update({
      recurrence_id: recurrenceId,
      recurrence_index: recurrenceIndex,
    })
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  return didMutateAccessibleRow({ data, error });
}

export async function createAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const timeZone = context.membership.company.timezone;
  const parsed = parseAppointmentForm(formData, timeZone);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const scheduledStart = localDateTimeToUtcIso(
    parsed.data.date,
    parsed.data.time,
    timeZone,
  );

  const supabase = await createSupabaseServerClient();

  if (!parsed.data.repeatEnabled) {
    const { data, error } = await supabase.rpc("create_appointment", {
      p_pet_id: parsed.data.petId,
      p_service_id: parsed.data.serviceId,
      p_employee_id: parsed.data.employeeId,
      p_scheduled_start: scheduledStart,
      p_pet_size: parsed.data.petSize,
      p_notes: parsed.data.notes,
    });

    if (error || !data) {
      return { error: mapAppointmentError(error?.message) };
    }

    await syncAppointmentNotifications(supabase, companyId, String(data), timeZone);

    revalidateAgendaPaths(String(data));
    redirect(`/dashboard/agenda/${data}`);
  }

  const frequency = parsed.data.recurrenceFrequency!;
  const intervalValue = resolveIntervalValue(
    frequency,
    parsed.data.recurrenceIntervalDays,
  );
  const maxOccurrences =
    parsed.data.recurrenceEndMode === "count"
      ? (parsed.data.recurrenceMaxOccurrences ?? null)
      : null;
  const endsAt =
    parsed.data.recurrenceEndMode === "date"
      ? (parsed.data.recurrenceEndsAt ?? null)
      : null;

  const starts = expandRecurrenceStarts({
    startUtcIso: scheduledStart,
    timeZone,
    frequency,
    intervalValue,
    maxOccurrences,
    endsAtLocalDate: endsAt,
  });

  if (starts.length < 2) {
    return {
      error:
        "A recorrência precisa gerar pelo menos 2 ocorrências. Ajuste a frequência ou o término.",
    };
  }

  const { data: recurrence, error: recurrenceError } = await supabase
    .from("appointment_recurrences")
    .insert({
      company_id: companyId,
      frequency,
      interval_value: intervalValue,
      ends_at: endsAt,
      max_occurrences: maxOccurrences,
      created_by: context.user.id,
      active: true,
    })
    .select("id")
    .maybeSingle();

  if (recurrenceError || !recurrence) {
    return { error: "Não foi possível criar a recorrência." };
  }

  const createdIds: string[] = [];
  let skippedCount = 0;

  for (let index = 0; index < starts.length; index += 1) {
    const occurrenceStart = starts[index]!;
    const { data: appointmentId, error } = await supabase.rpc("create_appointment", {
      p_pet_id: parsed.data.petId,
      p_service_id: parsed.data.serviceId,
      p_employee_id: parsed.data.employeeId,
      p_scheduled_start: occurrenceStart,
      p_pet_size: parsed.data.petSize,
      p_notes: parsed.data.notes,
    });

    if (error || !appointmentId) {
      skippedCount += 1;
      continue;
    }

    const linked = await linkAppointmentToRecurrence(
      supabase,
      companyId,
      String(appointmentId),
      recurrence.id,
      index + 1,
    );

    if (!linked) {
      skippedCount += 1;
      continue;
    }

    createdIds.push(String(appointmentId));
    await syncAppointmentNotifications(
      supabase,
      companyId,
      String(appointmentId),
      timeZone,
    );
  }

  if (createdIds.length === 0) {
    await supabase
      .from("appointment_recurrences")
      .update({ active: false })
      .eq("id", recurrence.id)
      .eq("company_id", companyId);

    return {
      error:
        "Nenhum agendamento pôde ser criado. Verifique conflitos, jornada e disponibilidade.",
    };
  }

  await supabase
    .from("appointment_recurrences")
    .update({ source_appointment_id: createdIds[0]! })
    .eq("id", recurrence.id)
    .eq("company_id", companyId);

  const summary = formatRecurrenceSkipSummary(createdIds.length, skippedCount);
  revalidateAgendaPaths(createdIds[0]);

  if (skippedCount > 0) {
    redirect(
      `/dashboard/agenda/${createdIds[0]}?recorrencia=parcial&criados=${createdIds.length}&pulados=${skippedCount}`,
    );
  }

  redirect(`/dashboard/agenda/${createdIds[0]}?recorrencia=1&criados=${createdIds.length}`);
  // Unreachable, keeps type happy if redirect typing changes
  return { success: summary };
}

async function updateFollowingRecurrenceAppointments(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  companyId: string;
  timeZone: string;
  recurrenceId: string;
  fromScheduledStart: string;
  excludeAppointmentId: string;
  petId: string;
  serviceId: string;
  employeeId: string;
  petSize: string | null;
  notes: string | null;
  dateDeltaMs: number;
}): Promise<{ updated: number; skipped: number }> {
  const { data: following, error } = await params.supabase
    .from("appointments")
    .select("id, scheduled_start, status")
    .eq("company_id", params.companyId)
    .eq("recurrence_id", params.recurrenceId)
    .gt("scheduled_start", params.fromScheduledStart)
    .in("status", ["scheduled", "confirmed"])
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: true });

  if (error || !following) {
    return { updated: 0, skipped: 0 };
  }

  let updated = 0;
  let skipped = 0;

  for (const row of following) {
    if (row.id === params.excludeAppointmentId) {
      continue;
    }

    const nextStart = new Date(
      new Date(row.scheduled_start).getTime() + params.dateDeltaMs,
    ).toISOString();

    const { error: updateError } = await params.supabase.rpc("update_appointment", {
      p_appointment_id: row.id,
      p_pet_id: params.petId,
      p_service_id: params.serviceId,
      p_employee_id: params.employeeId,
      p_scheduled_start: nextStart,
      p_pet_size: params.petSize,
      p_notes: params.notes,
    });

    if (updateError) {
      skipped += 1;
      continue;
    }

    await syncAppointmentNotifications(
      params.supabase,
      params.companyId,
      row.id,
      params.timeZone,
    );

    updated += 1;
  }

  return { updated, skipped };
}

export async function updateAppointmentAction(
  appointmentId: string,
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const timeZone = context.membership.company.timezone;
  const parsed = parseAppointmentForm(formData, timeZone);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const scheduledStart = localDateTimeToUtcIso(
    parsed.data.date,
    parsed.data.time,
    timeZone,
  );

  const supabase = await createSupabaseServerClient();

  const { data: current, error: currentError } = await supabase
    .from("appointments")
    .select("id, scheduled_start, recurrence_id, status")
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (currentError || !current) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data, error } = await supabase.rpc("update_appointment", {
    p_appointment_id: appointmentId,
    p_pet_id: parsed.data.petId,
    p_service_id: parsed.data.serviceId,
    p_employee_id: parsed.data.employeeId,
    p_scheduled_start: scheduledStart,
    p_pet_size: parsed.data.petSize,
    p_notes: parsed.data.notes,
  });

  if (error || !data) {
    return { error: mapAppointmentError(error?.message) };
  }

  await syncAppointmentNotifications(supabase, companyId, appointmentId, timeZone);

  const scope: SeriesScope = parsed.data.seriesScope ?? "this";

  if (
    scope === "this_and_following" &&
    current.recurrence_id &&
    (current.status === "scheduled" || current.status === "confirmed")
  ) {
    const dateDeltaMs =
      new Date(scheduledStart).getTime() - new Date(current.scheduled_start).getTime();

    const result = await updateFollowingRecurrenceAppointments({
      supabase,
      companyId,
      timeZone,
      recurrenceId: current.recurrence_id,
      fromScheduledStart: current.scheduled_start,
      excludeAppointmentId: appointmentId,
      petId: parsed.data.petId,
      serviceId: parsed.data.serviceId,
      employeeId: parsed.data.employeeId,
      petSize: parsed.data.petSize,
      notes: parsed.data.notes,
      dateDeltaMs,
    });

    revalidateAgendaPaths(appointmentId);

    if (result.skipped > 0) {
      redirect(
        `/dashboard/agenda/${appointmentId}?atualizado=1&serie=parcial&ok=${result.updated + 1}&pulados=${result.skipped}`,
      );
    }

    redirect(`/dashboard/agenda/${appointmentId}?atualizado=1&serie=1`);
  }

  revalidateAgendaPaths(appointmentId);
  redirect(`/dashboard/agenda/${appointmentId}?atualizado=1`);
}

async function transitionAppointmentStatus(
  appointmentId: string,
  nextStatus: AppointmentStatus,
  extra?: { cancellation_reason?: string | null; seriesScope?: SeriesScope },
): Promise<AppointmentActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();

  const { data: current, error: fetchError } = await supabase
    .from("appointments")
    .select("id, status, company_id, recurrence_id, scheduled_start")
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !current) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  if (!canTransitionStatus(current.status, nextStatus)) {
    return { error: "Esta alteração de status não é permitida." };
  }

  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: nextStatus,
      ...(extra?.cancellation_reason !== undefined
        ? { cancellation_reason: extra.cancellation_reason }
        : {}),
    })
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  if (nextStatus === "cancelled") {
    await cancelAppointmentNotificationsForStatusChange(
      supabase,
      companyId,
      appointmentId,
    );
  }

  let followingCancelled = 0;

  if (
    nextStatus === "cancelled" &&
    extra?.seriesScope === "this_and_following" &&
    current.recurrence_id
  ) {
    const { data: following } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: extra.cancellation_reason ?? "Cancelado com a série",
      })
      .eq("company_id", companyId)
      .eq("recurrence_id", current.recurrence_id)
      .gt("scheduled_start", current.scheduled_start)
      .in("status", ["scheduled", "confirmed"])
      .is("deleted_at", null)
      .select("id");

    followingCancelled = following?.length ?? 0;

    if (following?.length) {
      for (const row of following) {
        await cancelAppointmentNotificationsForStatusChange(
          supabase,
          companyId,
          row.id,
        );
      }
    }
  }

  revalidateAgendaPaths(appointmentId);

  if (nextStatus === "cancelled" && extra?.seriesScope === "this_and_following") {
    return {
      success:
        followingCancelled > 0
          ? `Agendamento cancelado e mais ${followingCancelled} ocorrência(s) futura(s).`
          : "Agendamento cancelado.",
    };
  }

  const successMessages: Partial<Record<AppointmentStatus, string>> = {
    confirmed: "Agendamento confirmado.",
    cancelled: "Agendamento cancelado.",
    no_show: "Agendamento marcado como não compareceu.",
  };

  return { success: successMessages[nextStatus] ?? "Status atualizado." };
}

export async function confirmAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionState> {
  return transitionAppointmentStatus(appointmentId, "confirmed");
}

export async function cancelAppointmentAction(
  appointmentId: string,
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = cancelAppointmentSchema.safeParse({
    cancellationReason: formData.get("cancellationReason"),
    seriesScope: formData.get("seriesScope") || "this",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  return transitionAppointmentStatus(appointmentId, "cancelled", {
    cancellation_reason: parsed.data.cancellationReason,
    seriesScope: parsed.data.seriesScope,
  });
}

export async function markNoShowAction(
  appointmentId: string,
): Promise<AppointmentActionState> {
  return transitionAppointmentStatus(appointmentId, "no_show");
}

export async function getAvailableSlotsAction(input: {
  employeeId: string;
  serviceId: string;
  date: string;
  durationMinutes: number;
  petSize?: PetSize | null;
  excludeAppointmentId?: string;
}): Promise<{ slots: string[]; error?: string }> {
  const context = await requireCompanyContext();
  const timeZone = context.membership.company.timezone;

  if (
    !isValidUuid(input.employeeId) ||
    !isValidUuid(input.serviceId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
  ) {
    return { slots: [], error: "Parâmetros inválidos." };
  }

  try {
    const slots = await getAvailableTimeSlots(
      context.membership.company.id,
      input.employeeId,
      input.serviceId,
      input.date,
      timeZone,
      input.durationMinutes,
      input.petSize ?? null,
      input.excludeAppointmentId,
    );

    return { slots };
  } catch {
    return { slots: [], error: "Não foi possível carregar horários disponíveis." };
  }
}
