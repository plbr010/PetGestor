"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCustomerById } from "@/features/customers/queries";
import {
  parsePetForm,
  parsePetImportantInfo,
  petFormToDbPayload,
} from "@/features/pets/schemas";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PetActionState = {
  error?: string;
  success?: string;
};

async function assertCustomerInCompany(companyId: string, customerId: string): Promise<boolean> {
  if (!isValidUuid(customerId)) {
    return false;
  }

  const customer = await getCustomerById(companyId, customerId);
  return Boolean(customer);
}

export async function createPetAction(
  _prevState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  const context = await requireCompanyContext();
  const parsed = parsePetForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const customerOk = await assertCustomerInCompany(
    context.membership.company.id,
    parsed.data.customerId,
  );

  if (!customerOk) {
    return { error: "Selecione um tutor válido." };
  }

  const supabase = await createSupabaseServerClient();
  const payload = petFormToDbPayload(parsed.data);

  const { data, error } = await supabase
    .from("pets")
    .insert({
      company_id: context.membership.company.id,
      created_by: context.user.id,
      ...payload,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível cadastrar o pet. Tente novamente." };
  }

  revalidatePath("/dashboard/pets");
  revalidatePath(`/dashboard/tutores/${parsed.data.customerId}`);
  revalidatePath("/dashboard");
  redirect(`/dashboard/pets/${data.id}`);
}

export async function updatePetAction(
  petId: string,
  _prevState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parsePetForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const customerOk = await assertCustomerInCompany(
    context.membership.company.id,
    parsed.data.customerId,
  );

  if (!customerOk) {
    return { error: "Selecione um tutor válido." };
  }

  const supabase = await createSupabaseServerClient();
  const payload = petFormToDbPayload(parsed.data);

  const { data, error } = await supabase
    .from("pets")
    .update(payload)
    .eq("id", petId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id, customer_id")
    .maybeSingle();

  const mutation = { data, error };

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/pets");
  revalidatePath(`/dashboard/pets/${petId}`);
  revalidatePath(`/dashboard/tutores/${mutation.data.customer_id}`);
  redirect(`/dashboard/pets/${petId}?atualizado=1`);
}

export async function updatePetImportantInfoAction(
  petId: string,
  _prevState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parsePetImportantInfo(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pets")
    .update({
      allergies: parsed.data.allergies,
      important_notes: parsed.data.importantNotes,
    })
    .eq("id", petId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath(`/dashboard/pets/${petId}`);
  revalidatePath("/dashboard/atendimentos");

  return { success: "Informações importantes salvas." };
}

export async function archivePetAction(petId: string): Promise<PetActionState> {
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", petId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id, customer_id")
    .maybeSingle();

  const mutation = { data, error };

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/pets");
  revalidatePath(`/dashboard/tutores/${mutation.data.customer_id}`);
  revalidatePath("/dashboard");
  redirect("/dashboard/pets?arquivado=1");
}

export async function restorePetAction(petId: string): Promise<PetActionState> {
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pets")
    .update({ deleted_at: null })
    .eq("id", petId)
    .eq("company_id", context.membership.company.id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/pets");
  redirect(`/dashboard/pets/${petId}?restaurado=1`);
}
