"use server";

import { revalidatePath } from "next/cache";

import { parseWaitlistForm } from "@/features/appointments/waitlist/schemas";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WaitlistActionState = {
  error?: string;
  success?: string;
};

function revalidateAgendaWaitlist() {
  revalidatePath("/dashboard/agenda");
}

export async function addWaitlistEntryAction(
  _prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const context = await requireCompanyContext();
  const parsed = parseWaitlistForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("customer_id")
    .eq("company_id", context.membership.company.id)
    .eq("id", parsed.data.petId)
    .eq("customer_id", parsed.data.customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!pet) {
    return { error: "Pet ou tutor inválido." };
  }

  const { error } = await supabase.from("appointment_waitlist").insert({
    company_id: context.membership.company.id,
    customer_id: parsed.data.customerId,
    pet_id: parsed.data.petId,
    service_id: parsed.data.serviceId,
    preferred_employee_id: parsed.data.preferredEmployeeId,
    preferred_date: parsed.data.preferredDate,
    preferred_period: (parsed.data.preferredPeriod ?? "any") as
      | "morning"
      | "afternoon"
      | "evening"
      | "any",
    preferred_time_start: parsed.data.preferredTimeStart,
    preferred_time_end: parsed.data.preferredTimeEnd,
    notes: parsed.data.notes,
    created_by: context.user.id,
  });

  if (error) {
    return { error: "Não foi possível adicionar à lista de espera." };
  }

  revalidateAgendaWaitlist();
  return { success: "Cliente adicionado à lista de espera." };
}

export async function markWaitlistContactedAction(
  waitlistId: string,
): Promise<WaitlistActionState> {
  if (!isValidUuid(waitlistId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("appointment_waitlist")
    .update({
      status: "contacted",
      contacted_at: new Date().toISOString(),
    })
    .eq("id", waitlistId)
    .eq("company_id", context.membership.company.id)
    .in("status", ["waiting", "contacted"])
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateAgendaWaitlist();
  return { success: "Marcado como contatado." };
}

export async function cancelWaitlistEntryAction(
  waitlistId: string,
): Promise<WaitlistActionState> {
  if (!isValidUuid(waitlistId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("appointment_waitlist")
    .update({ status: "cancelled" })
    .eq("id", waitlistId)
    .eq("company_id", context.membership.company.id)
    .in("status", ["waiting", "contacted"])
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateAgendaWaitlist();
  return { success: "Removido da lista de espera." };
}

export async function convertWaitlistEntryAction(
  waitlistId: string,
  appointmentId: string,
): Promise<WaitlistActionState> {
  if (!isValidUuid(waitlistId) || !isValidUuid(appointmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id")
    .eq("id", appointmentId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!appointment) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data, error } = await supabase
    .from("appointment_waitlist")
    .update({
      status: "converted",
      appointment_id: appointmentId,
    })
    .eq("id", waitlistId)
    .eq("company_id", context.membership.company.id)
    .in("status", ["waiting", "contacted"])
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateAgendaWaitlist();
  return { success: "Lista de espera convertida em agendamento." };
}
