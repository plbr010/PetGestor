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
  shiftOccurrenceCivilStart,
  type RecurrenceFrequency,
} from "@/features/appointments/recurrence";
import {
  interpretStatusTransitionResult,
  shouldEmitStatusSideEffects,
  type StatusTransitionRpcResult,
} from "@/features/appointments/status-transition";
import {
  countMatchingWaitlistEntries,
} from "@/features/appointments/waitlist/utils";
import { getWaitlistMatchCandidates } from "@/features/appointments/waitlist/queries";
import { getAvailableTimeSlots } from "@/features/appointments/queries";
import { mapAppointmentError } from "@/features/appointments/utils";
import {
  cancelAppointmentNotificationsForStatusChange,
  syncAppointmentNotifications,
} from "@/features/notifications/queue-service";
import { notifyAppointmentAssigned } from "@/features/app-notifications/emitters";
import { requirePermission } from "@/lib/auth/require-permission";
import type { Permission } from "@/lib/auth/permissions";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localDateTimeToUtcIso, diffCivilDays, utcToCompanyLocal, isValidCivilDate } from "@/lib/timezone";
import type { AppointmentStatus, PetSize } from "@/types/database.types";

export type AppointmentActionState = {
  error?: string;
  success?: string;
  appointmentId?: string;
  waitlistMatches?: number;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseRecurrenceRpcResult(value: unknown): {
  appointmentIds: string[];
  skippedCount: number;
  idempotent: boolean;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const appointmentIds = asStringArray(record.appointment_ids);
  const skippedCount =
    typeof record.skipped_count === "number" ? record.skipped_count : 0;

  if (appointmentIds.length === 0) {
    return null;
  }

  return {
    appointmentIds,
    skippedCount,
    idempotent: record.idempotent === true,
  };
}

function parseStatusTransitionRpc(value: unknown): StatusTransitionRpcResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.status !== "string") {
    return null;
  }

  return {
    id: record.id,
    status: record.status as StatusTransitionRpcResult["status"],
    changed: record.changed === true,
    idempotent: record.idempotent === true,
    following_updated:
      typeof record.following_updated === "number" ? record.following_updated : 0,
  };
}

export async function createAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const context = await requirePermission("appointments.create");
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
      p_customer_package_id: parsed.data.customerPackageId ?? null,
      p_company_id: context.membership.company.id,
    });

    if (error || !data) {
      return { error: mapAppointmentError(error?.message) };
    }

    await syncAppointmentNotifications(supabase, companyId, String(data), timeZone);
    await notifyAppointmentAssigned(supabase, companyId, String(data));

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

  const { data, error } = await supabase.rpc("create_appointment_recurrence", {
    p_pet_id: parsed.data.petId,
    p_service_id: parsed.data.serviceId,
    p_employee_id: parsed.data.employeeId,
    p_scheduled_starts: starts,
    p_pet_size: parsed.data.petSize,
    p_notes: parsed.data.notes,
    p_frequency: frequency,
    p_interval_value: intervalValue,
    p_ends_at: endsAt,
    p_max_occurrences: maxOccurrences,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_company_id: context.membership.company.id,
  });

  if (error || !data) {
    return { error: mapAppointmentError(error?.message) };
  }

  const recurrenceResult = parseRecurrenceRpcResult(data);
  if (!recurrenceResult) {
    return {
      error:
        "Nenhum agendamento pôde ser criado. Verifique conflitos, jornada e disponibilidade.",
    };
  }

  const createdIds = recurrenceResult.appointmentIds;
  const skippedCount = recurrenceResult.skippedCount;

  if (!recurrenceResult.idempotent) {
    for (const appointmentId of createdIds) {
      await syncAppointmentNotifications(supabase, companyId, appointmentId, timeZone);
    }

    if (createdIds[0]) {
      await notifyAppointmentAssigned(supabase, companyId, createdIds[0]);
    }
  }

  revalidateAgendaPaths(createdIds[0]);

  if (skippedCount > 0) {
    redirect(
      `/dashboard/agenda/${createdIds[0]}?recorrencia=parcial&criados=${createdIds.length}&pulados=${skippedCount}`,
    );
  }

  redirect(`/dashboard/agenda/${createdIds[0]}?recorrencia=1&criados=${createdIds.length}`);
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
  customerPackageId: string | null;
  dateDeltaDays: number;
  localTime: string;
}): Promise<{ updated: number; skipped: number }> {
  const { data: following, error } = await params.supabase
    .from("appointments")
    .select("id, scheduled_start, status, customer_package_id")
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

    const nextStart = shiftOccurrenceCivilStart({
      occurrenceStartUtcIso: row.scheduled_start,
      timeZone: params.timeZone,
      dateDeltaDays: params.dateDeltaDays,
      localTime: params.localTime,
    });

    const { error: updateError } = await params.supabase.rpc("update_appointment", {
      p_appointment_id: row.id,
      p_pet_id: params.petId,
      p_service_id: params.serviceId,
      p_employee_id: params.employeeId,
      p_scheduled_start: nextStart,
      p_pet_size: params.petSize,
      p_notes: params.notes,
      p_customer_package_id: row.customer_package_id ?? params.customerPackageId,
      p_company_id: params.companyId,
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

  const context = await requirePermission("appointments.edit");
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
    p_customer_package_id: parsed.data.customerPackageId ?? null,
    p_company_id: context.membership.company.id,
  });

  if (error || !data) {
    return { error: mapAppointmentError(error?.message) };
  }

  await syncAppointmentNotifications(supabase, companyId, appointmentId, timeZone);
  await notifyAppointmentAssigned(supabase, companyId, appointmentId);

  const scope: SeriesScope = parsed.data.seriesScope ?? "this";

  if (
    scope === "this_and_following" &&
    current.recurrence_id &&
    (current.status === "scheduled" || current.status === "confirmed")
  ) {
    const origin = utcToCompanyLocal(current.scheduled_start, timeZone);
    const dateDeltaDays = diffCivilDays(origin.date, parsed.data.date);

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
      customerPackageId: parsed.data.customerPackageId ?? null,
      dateDeltaDays,
      localTime: parsed.data.time,
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
  extra?: {
    cancellation_reason?: string | null;
    seriesScope?: SeriesScope;
    waitlistMatches?: number;
  },
): Promise<AppointmentActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const permission: Permission =
    nextStatus === "cancelled" ? "appointments.cancel" : "appointments.edit";
  const context = await requirePermission(permission);
  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("transition_appointment_status", {
    p_appointment_id: appointmentId,
    p_next_status: nextStatus,
    p_cancellation_reason: extra?.cancellation_reason ?? null,
    p_series_scope: extra?.seriesScope ?? "this",
    p_company_id: companyId,
  });

  if (error) {
    return { error: mapAppointmentError(error.message) };
  }

  const rpc = parseStatusTransitionRpc(data);
  const outcome = interpretStatusTransitionResult({
    requested: nextStatus,
    rpc,
  });

  if (outcome.kind === "not_found") {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  if (outcome.kind === "conflict") {
    return { error: "Este agendamento já foi atualizado por outra ação." };
  }

  if (shouldEmitStatusSideEffects(outcome) && rpc) {
    if (nextStatus === "cancelled" || nextStatus === "no_show") {
      await cancelAppointmentNotificationsForStatusChange(
        supabase,
        companyId,
        appointmentId,
      );

      const followingIds = asStringArray(
        data && typeof data === "object"
          ? (data as Record<string, unknown>).following_ids
          : [],
      );

      for (const followingId of followingIds) {
        await cancelAppointmentNotificationsForStatusChange(
          supabase,
          companyId,
          followingId,
        );
      }
    }
  }

  revalidateAgendaPaths(appointmentId);

  const followingCancelled = rpc?.following_updated ?? 0;

  if (nextStatus === "cancelled" && extra?.seriesScope === "this_and_following") {
    return {
      success:
        followingCancelled > 0
          ? `Agendamento cancelado e mais ${followingCancelled} ocorrência(s) futura(s).`
          : "Agendamento cancelado.",
      waitlistMatches: extra?.waitlistMatches,
    };
  }

  const successMessages: Partial<Record<AppointmentStatus, string>> = {
    confirmed: "Agendamento confirmado.",
    cancelled: "Agendamento cancelado.",
    no_show: "Agendamento marcado como não compareceu.",
  };

  return {
    success: successMessages[nextStatus] ?? "Status atualizado.",
    waitlistMatches: extra?.waitlistMatches,
  };
}

export async function confirmAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionState> {
  return transitionAppointmentStatus(appointmentId, "confirmed");
}

export async function createAppointmentInlineAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const context = await requirePermission("appointments.create");
  const companyId = context.membership.company.id;
  const timeZone = context.membership.company.timezone;
  const parsed = parseAppointmentForm(formData, timeZone);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (parsed.data.repeatEnabled) {
    return { error: "Use a página completa para agendamentos recorrentes." };
  }

  const scheduledStart = localDateTimeToUtcIso(
    parsed.data.date,
    parsed.data.time,
    timeZone,
  );

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_appointment", {
    p_pet_id: parsed.data.petId,
    p_service_id: parsed.data.serviceId,
    p_employee_id: parsed.data.employeeId,
    p_scheduled_start: scheduledStart,
    p_pet_size: parsed.data.petSize,
    p_notes: parsed.data.notes,
    p_customer_package_id: parsed.data.customerPackageId ?? null,
    p_company_id: context.membership.company.id,
  });

  if (error || !data) {
    return { error: mapAppointmentError(error?.message) };
  }

  const appointmentId = String(data);
  await syncAppointmentNotifications(supabase, companyId, appointmentId, timeZone);
  await notifyAppointmentAssigned(supabase, companyId, appointmentId);

  const waitlistId = String(formData.get("waitlistId") ?? "");
  if (isValidUuid(waitlistId)) {
    await supabase
      .from("appointment_waitlist")
      .update({
        status: "converted",
        appointment_id: appointmentId,
      })
      .eq("id", waitlistId)
      .eq("company_id", companyId)
      .in("status", ["waiting", "contacted"]);
  }

  revalidateAgendaPaths(appointmentId);
  return { success: "Agendamento criado.", appointmentId };
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

  const context = await requirePermission("appointments.cancel");
  const companyId = context.membership.company.id;
  const timeZone = context.membership.company.timezone;
  const supabase = await createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("service_id, employee_id, scheduled_start, scheduled_end")
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  let waitlistMatches = 0;

  if (appointment) {
    const candidates = await getWaitlistMatchCandidates(companyId);
    waitlistMatches = countMatchingWaitlistEntries(candidates, appointment, timeZone);
  }

  const result = await transitionAppointmentStatus(appointmentId, "cancelled", {
    cancellation_reason: parsed.data.cancellationReason,
    seriesScope: parsed.data.seriesScope,
    waitlistMatches,
  });

  return result;
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
  const context = await requirePermission("appointments.view");
  const timeZone = context.membership.company.timezone;

  if (
    !isValidUuid(input.employeeId) ||
    !isValidUuid(input.serviceId) ||
    !isValidCivilDate(input.date)
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
