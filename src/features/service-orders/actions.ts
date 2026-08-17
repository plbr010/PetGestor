"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseCheckInForm,
  parseCompleteServiceOrderForm,
  parseServiceOrderNotesForm,
} from "@/features/service-orders/schemas";
import { mapServiceOrderError } from "@/features/service-orders/utils";
import { enqueuePetReadyNotification } from "@/features/notifications/queue-service";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceOrderActionState = {
  error?: string;
  success?: string;
};

function revalidateServiceOrderPaths(serviceOrderId?: string, appointmentId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/atendimentos");
  revalidatePath("/dashboard/agenda");

  if (serviceOrderId) {
    revalidatePath(`/dashboard/atendimentos/${serviceOrderId}`);
  }

  if (appointmentId) {
    revalidatePath(`/dashboard/agenda/${appointmentId}`);
  }
}

export async function checkInAppointmentInlineAction(
  appointmentId: string,
): Promise<ServiceOrderActionState & { serviceOrderId?: string }> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("check_in_appointment", {
    p_appointment_id: appointmentId,
    p_intake_notes: null,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(String(data), appointmentId);
  return {
    success: "Check-in realizado.",
    serviceOrderId: String(data),
  };
}

export async function checkInAppointmentAction(
  appointmentId: string,
  _prevState: ServiceOrderActionState,
  formData: FormData,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const parsed = parseCheckInForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("check_in_appointment", {
    p_appointment_id: appointmentId,
    p_intake_notes: parsed.data.intakeNotes,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(String(data), appointmentId);
  redirect(`/dashboard/atendimentos/${data}`);
}

export async function startServiceOrderAction(
  serviceOrderId: string,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("start_service_order", {
    p_service_order_id: serviceOrderId,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Atendimento iniciado." };
}

export async function markServiceOrderReadyAction(
  serviceOrderId: string,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("mark_service_order_ready", {
    p_service_order_id: serviceOrderId,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  await enqueuePetReadyNotification(
    supabase,
    context.membership.company.id,
    serviceOrderId,
    context.membership.company.timezone,
  );

  revalidateServiceOrderPaths(serviceOrderId);
  revalidatePath("/dashboard/configuracoes");
  return { success: "Pet marcado como pronto para buscar." };
}

export async function completeServiceOrderAction(
  serviceOrderId: string,
  _prevState: ServiceOrderActionState,
  formData: FormData,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const parsed = parseCompleteServiceOrderForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("complete_service_order", {
    p_service_order_id: serviceOrderId,
    p_completion_notes: parsed.data.completionNotes,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Entrega finalizada com sucesso." };
}

export async function cancelServiceOrderAction(
  serviceOrderId: string,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("cancel_service_order", {
    p_service_order_id: serviceOrderId,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Atendimento cancelado." };
}

export async function updateServiceOrderNotesAction(
  serviceOrderId: string,
  _prevState: ServiceOrderActionState,
  formData: FormData,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const parsed = parseServiceOrderNotesForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_service_order_notes", {
    p_service_order_id: serviceOrderId,
    p_intake_notes: parsed.data.intakeNotes,
    p_internal_notes: parsed.data.internalNotes,
    p_completion_notes: parsed.data.completionNotes,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Observações salvas." };
}

export async function checkInAppointmentSimpleAction(
  appointmentId: string,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("check_in_appointment", {
    p_appointment_id: appointmentId,
    p_intake_notes: null,
  });

  if (error || !data) {
    return { error: mapServiceOrderError(error?.message) };
  }

  revalidateServiceOrderPaths(String(data), appointmentId);
  redirect(`/dashboard/atendimentos/${data}`);
}
