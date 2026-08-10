"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { countActivePetsForCustomer } from "@/features/customers/queries";
import { parseCustomerForm } from "@/features/customers/schemas";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerActionState = {
  error?: string;
  success?: string;
};

export async function createCustomerAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const context = await requireCompanyContext();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customers")
    .insert({
      company_id: context.membership.company.id,
      created_by: context.user.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível cadastrar o tutor. Tente novamente." };
  }

  revalidatePath("/dashboard/tutores");
  revalidatePath("/dashboard");
  redirect(`/dashboard/tutores/${data.id}`);
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  if (!isValidUuid(customerId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      notes: parsed.data.notes,
    })
    .eq("id", customerId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/tutores");
  revalidatePath(`/dashboard/tutores/${customerId}`);
  redirect(`/dashboard/tutores/${customerId}?atualizado=1`);
}

export async function archiveCustomerAction(
  customerId: string,
): Promise<CustomerActionState> {
  if (!isValidUuid(customerId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const activePets = await countActivePetsForCustomer(
    context.membership.company.id,
    customerId,
  );

  if (activePets > 0) {
    return {
      error: "Arquive os pets deste tutor antes de arquivar o cadastro.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/tutores");
  revalidatePath("/dashboard");
  redirect("/dashboard/tutores?arquivado=1");
}

export async function restoreCustomerAction(
  customerId: string,
): Promise<CustomerActionState> {
  if (!isValidUuid(customerId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customers")
    .update({ deleted_at: null })
    .eq("id", customerId)
    .eq("company_id", context.membership.company.id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/tutores");
  redirect(`/dashboard/tutores/${customerId}?restaurado=1`);
}
