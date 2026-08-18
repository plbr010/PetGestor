"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseEmployeeForm } from "@/features/employees/schemas";
import { workingHoursToRpcPayload } from "@/features/employees/utils";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmployeeActionState = {
  error?: string;
  success?: string;
};

export async function createEmployeeAction(
  _prevState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  await requirePermission("employees.manage");
  const parsed = parseEmployeeForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_employee_with_schedule", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_job_title: parsed.data.jobTitle,
    p_notes: parsed.data.notes,
    p_active: parsed.data.active,
    p_can_be_scheduled: parsed.data.canBeScheduled,
    p_service_ids: parsed.data.serviceIds,
    p_working_hours: workingHoursToRpcPayload(parsed.data.workingHours),
  });

  if (error || !data) {
    return { error: "Não foi possível cadastrar o funcionário. Tente novamente." };
  }

  revalidatePath("/dashboard/funcionarios");
  revalidatePath("/dashboard");
  redirect(`/dashboard/funcionarios/${data}`);
}

export async function updateEmployeeAction(
  employeeId: string,
  _prevState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requirePermission("employees.manage");
  const parsed = parseEmployeeForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_employee_with_schedule", {
    p_employee_id: employeeId,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_job_title: parsed.data.jobTitle,
    p_notes: parsed.data.notes,
    p_active: parsed.data.active,
    p_can_be_scheduled: parsed.data.canBeScheduled,
    p_service_ids: parsed.data.serviceIds,
    p_working_hours: workingHoursToRpcPayload(parsed.data.workingHours),
  });

  if (error || !data) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/funcionarios");
  revalidatePath(`/dashboard/funcionarios/${employeeId}`);
  revalidatePath("/dashboard");
  redirect(`/dashboard/funcionarios/${employeeId}?atualizado=1`);
}

export async function toggleEmployeeActiveAction(
  employeeId: string,
  nextActive: boolean,
): Promise<EmployeeActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const supabase = await createSupabaseServerClient();

  const mutation = await supabase
    .from("employees")
    .update({ active: nextActive })
    .eq("id", employeeId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/funcionarios");
  revalidatePath(`/dashboard/funcionarios/${employeeId}`);
  revalidatePath("/dashboard");

  return {
    success: nextActive ? "Funcionário reativado." : "Funcionário desativado.",
  };
}

export async function archiveEmployeeAction(employeeId: string): Promise<EmployeeActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const supabase = await createSupabaseServerClient();

  const mutation = await supabase
    .from("employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", employeeId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/funcionarios");
  revalidatePath("/dashboard");
  redirect("/dashboard/funcionarios?arquivado=1");
}

export async function restoreEmployeeAction(employeeId: string): Promise<EmployeeActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const supabase = await createSupabaseServerClient();

  const mutation = await supabase
    .from("employees")
    .update({ deleted_at: null })
    .eq("id", employeeId)
    .eq("company_id", context.membership.company.id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/funcionarios");
  redirect(`/dashboard/funcionarios/${employeeId}?restaurado=1`);
}
