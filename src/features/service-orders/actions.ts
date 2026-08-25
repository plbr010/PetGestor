"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseCheckInForm,
  parseCompleteServiceOrderForm,
  parseServiceOrderNotesForm,
} from "@/features/service-orders/schemas";
import { mapServiceOrderError } from "@/features/service-orders/utils";
import { parseQuantityInput } from "@/features/inventory/stock-engine";
import { enqueuePetReadyNotification } from "@/features/notifications/queue-service";
import {
  notifyProductStockStatus,
  notifyServiceOrderReady,
} from "@/features/app-notifications/emitters";
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
  revalidatePath("/dashboard/estoque");
  revalidatePath("/dashboard/estoque/movimentacoes");

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

  const { data: consumedProducts } = await supabase
    .from("service_order_consumptions")
    .select("product_id")
    .eq("company_id", context.membership.company.id)
    .eq("service_order_id", serviceOrderId)
    .not("consumed_at", "is", null);

  const productIds = [...new Set((consumedProducts ?? []).map((row) => row.product_id))];
  for (const productId of productIds) {
    await notifyProductStockStatus(supabase, context.membership.company.id, productId);
  }

  await enqueuePetReadyNotification(
    supabase,
    context.membership.company.id,
    serviceOrderId,
    context.membership.company.timezone,
  );
  await notifyServiceOrderReady(
    supabase,
    context.membership.company.id,
    serviceOrderId,
  );

  revalidateServiceOrderPaths(serviceOrderId);
  revalidatePath("/dashboard/configuracoes");
  return { success: "Pet marcado como pronto para buscar." };
}

export async function upsertServiceOrderConsumptionAction(
  serviceOrderId: string,
  _prevState: ServiceOrderActionState,
  formData: FormData,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();

  const productId = String(formData.get("productId") ?? "");
  const quantity = parseQuantityInput(String(formData.get("quantity") ?? ""));
  const sourceRaw = String(formData.get("source") ?? "manual");
  const source = sourceRaw === "recipe" ? "recipe" : "manual";

  if (!isValidUuid(productId) || quantity == null) {
    return { error: "Informe produto e quantidade válidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_service_order_consumption", {
    p_service_order_id: serviceOrderId,
    p_product_id: productId,
    p_quantity: quantity,
    p_source: source,
  });

  if (error) {
    return { error: mapServiceOrderError(error.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Produto atualizado." };
}

export async function removeServiceOrderConsumptionAction(
  consumptionId: string,
  serviceOrderId: string,
): Promise<ServiceOrderActionState> {
  if (!isValidUuid(consumptionId) || !isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_service_order_consumption", {
    p_consumption_id: consumptionId,
  });

  if (error) {
    return { error: mapServiceOrderError(error.message) };
  }

  revalidateServiceOrderPaths(serviceOrderId);
  return { success: "Produto removido." };
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
