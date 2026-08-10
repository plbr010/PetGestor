"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseServiceForm } from "@/features/services/schemas";
import { sizePricesToRpcPayload } from "@/features/services/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceActionState = {
  error?: string;
  success?: string;
};

function mapRpcError(error: { code?: string; message?: string } | null): string {
  if (!error) {
    return "Não foi possível concluir a operação. Tente novamente.";
  }

  return GENERIC_NOT_FOUND_MESSAGE;
}

export async function createServiceAction(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireCompanyContext();
  const parsed = parseServiceForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_service_with_prices", {
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_pricing_mode: parsed.data.pricingMode,
    p_price_cents: parsed.data.pricingMode === "fixed" ? parsed.data.priceCents : null,
    p_duration_minutes:
      parsed.data.pricingMode === "fixed"
        ? (parsed.data.durationMinutes ?? 0)
        : Math.min(...(parsed.data.sizePrices?.map((row) => row.durationMinutes) ?? [0])),
    p_active: parsed.data.active,
    p_size_prices:
      parsed.data.pricingMode === "by_size" && parsed.data.sizePrices
        ? sizePricesToRpcPayload(parsed.data.sizePrices)
        : null,
  });

  if (error || !data) {
    return { error: "Não foi possível cadastrar o serviço. Tente novamente." };
  }

  revalidatePath("/dashboard/servicos");
  revalidatePath("/dashboard");
  redirect(`/dashboard/servicos/${data}`);
}

export async function updateServiceAction(
  serviceId: string,
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  if (!isValidUuid(serviceId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const parsed = parseServiceForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_service_with_prices", {
    p_service_id: serviceId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_pricing_mode: parsed.data.pricingMode,
    p_price_cents: parsed.data.pricingMode === "fixed" ? parsed.data.priceCents : null,
    p_duration_minutes:
      parsed.data.pricingMode === "fixed"
        ? (parsed.data.durationMinutes ?? 0)
        : Math.min(...(parsed.data.sizePrices?.map((row) => row.durationMinutes) ?? [0])),
    p_active: parsed.data.active,
    p_size_prices:
      parsed.data.pricingMode === "by_size" && parsed.data.sizePrices
        ? sizePricesToRpcPayload(parsed.data.sizePrices)
        : null,
  });

  if (error || !data) {
    return { error: mapRpcError(error) };
  }

  revalidatePath("/dashboard/servicos");
  revalidatePath(`/dashboard/servicos/${serviceId}`);
  revalidatePath("/dashboard");
  redirect(`/dashboard/servicos/${serviceId}?atualizado=1`);
}

export async function archiveServiceAction(serviceId: string): Promise<ServiceActionState> {
  if (!isValidUuid(serviceId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const mutation = await supabase
    .from("services")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serviceId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/servicos");
  revalidatePath("/dashboard");
  redirect("/dashboard/servicos?arquivado=1");
}

export async function toggleServiceActiveAction(
  serviceId: string,
  nextActive: boolean,
): Promise<ServiceActionState> {
  if (!isValidUuid(serviceId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const mutation = await supabase
    .from("services")
    .update({ active: nextActive })
    .eq("id", serviceId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/dashboard/servicos");
  revalidatePath(`/dashboard/servicos/${serviceId}`);
  revalidatePath("/dashboard");

  return {
    success: nextActive ? "Serviço reativado." : "Serviço desativado.",
  };
}
