"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseSellPackageForm,
  parseServicePackageForm,
} from "@/features/service-packages/schemas";
import {
  mapPackageError,
  packageItemsToRpcPayload,
} from "@/features/service-packages/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServicePackageActionState = {
  error?: string;
  success?: string;
};

function revalidatePackagePaths(packageId?: string, petId?: string, serviceOrderId?: string) {
  revalidatePath("/dashboard/servicos");
  revalidatePath("/dashboard/servicos/pacotes");

  if (packageId) {
    revalidatePath(`/dashboard/servicos/pacotes/${packageId}`);
    revalidatePath(`/dashboard/servicos/pacotes/${packageId}/editar`);
  }

  if (petId) {
    revalidatePath(`/dashboard/pets/${petId}`);
    revalidatePath(`/dashboard/tutores`);
  }

  if (serviceOrderId) {
    revalidatePath(`/dashboard/atendimentos/${serviceOrderId}`);
  }

  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard/atendimentos");
}

export async function createServicePackageAction(
  _prevState: ServicePackageActionState,
  formData: FormData,
): Promise<ServicePackageActionState> {
  await requireCompanyContext();
  const parsed = parseServicePackageForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_service_package_with_items", {
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_price_cents: parsed.data.priceCents,
    p_validity_days: parsed.data.validityDays,
    p_active: parsed.data.active,
    p_items: packageItemsToRpcPayload(parsed.data.items),
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(String(data));
  redirect(`/dashboard/servicos/pacotes/${data}`);
}

export async function updateServicePackageAction(
  packageId: string,
  _prevState: ServicePackageActionState,
  formData: FormData,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(packageId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const parsed = parseServicePackageForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_service_package_with_items", {
    p_package_id: packageId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_price_cents: parsed.data.priceCents,
    p_validity_days: parsed.data.validityDays,
    p_active: parsed.data.active,
    p_items: packageItemsToRpcPayload(parsed.data.items),
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(packageId);
  redirect(`/dashboard/servicos/pacotes/${packageId}?atualizado=1`);
}

export async function toggleServicePackageActiveAction(
  packageId: string,
  active: boolean,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(packageId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_packages")
    .update({ active })
    .eq("id", packageId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePackagePaths(packageId);
  return { success: active ? "Pacote ativado." : "Pacote desativado." };
}

export async function archiveServicePackageAction(
  packageId: string,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(packageId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_packages")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", packageId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePackagePaths();
  redirect("/dashboard/servicos/pacotes?arquivado=1");
}

export async function sellCustomerPackageAction(
  petId: string,
  _prevState: ServicePackageActionState,
  formData: FormData,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parseSellPackageForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (parsed.data.financialStatus === "paid" && !parsed.data.paymentMethod) {
    return { error: "Informe a forma de pagamento." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, customer_id")
    .eq("id", petId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (petError || !pet) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data, error } = await supabase.rpc("sell_customer_service_package", {
    p_package_id: parsed.data.packageId,
    p_customer_id: pet.customer_id,
    p_pet_id: petId,
    p_starts_at: parsed.data.startsAt,
    p_financial_status: parsed.data.financialStatus,
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(undefined, petId);
  redirect(`/dashboard/pets/${petId}?pacote=1`);
}

export async function consumePackageCreditAction(
  serviceOrderId: string,
  customerPackageId: string,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(serviceOrderId) || !isValidUuid(customerPackageId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("consume_customer_service_package", {
    p_service_order_id: serviceOrderId,
    p_customer_package_id: customerPackageId,
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(undefined, undefined, serviceOrderId);
  return { success: "Pacote utilizado com sucesso." };
}

export async function reversePackageUsageAction(
  serviceOrderId: string,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(serviceOrderId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reverse_customer_service_package_usage", {
    p_service_order_id: serviceOrderId,
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(undefined, undefined, serviceOrderId);
  return { success: "Saldo do pacote estornado." };
}

export async function cancelCustomerPackageAction(
  customerPackageId: string,
  petId: string,
): Promise<ServicePackageActionState> {
  if (!isValidUuid(customerPackageId) || !isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("cancel_customer_service_package", {
    p_customer_package_id: customerPackageId,
  });

  if (error || !data) {
    return { error: mapPackageError(error?.message) };
  }

  revalidatePackagePaths(undefined, petId);
  return { success: "Pacote cancelado." };
}
