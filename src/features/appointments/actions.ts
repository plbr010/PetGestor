"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelAppointmentSchema,
  parseAppointmentForm,
} from "@/features/appointments/schemas";
import { canTransitionStatus } from "@/features/appointments/status";
import { getAvailableTimeSlots } from "@/features/appointments/queries";
import { mapAppointmentError } from "@/features/appointments/utils";
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

export async function createAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const context = await requireCompanyContext();
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

  revalidateAgendaPaths(String(data));
  redirect(`/dashboard/agenda/${data}`);
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

  revalidateAgendaPaths(appointmentId);
  redirect(`/dashboard/agenda/${appointmentId}?atualizado=1`);
}

async function transitionAppointmentStatus(
  appointmentId: string,
  nextStatus: AppointmentStatus,
  extra?: { cancellation_reason?: string | null },
): Promise<AppointmentActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data: current, error: fetchError } = await supabase
    .from("appointments")
    .select("id, status, company_id")
    .eq("id", appointmentId)
    .eq("company_id", context.membership.company.id)
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
    .eq("company_id", context.membership.company.id)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateAgendaPaths(appointmentId);

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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  return transitionAppointmentStatus(appointmentId, "cancelled", {
    cancellation_reason: parsed.data.cancellationReason,
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
