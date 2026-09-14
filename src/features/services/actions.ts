"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseRecipesJson, recipesToRpcPayload } from "@/features/services/mutation-engine";
import { parseServiceForm } from "@/features/services/schemas";
import { sizePricesToRpcPayload } from "@/features/services/utils";
import { requirePermission } from "@/lib/auth/require-permission";
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

  const message = error.message ?? "";
  if (message.includes("product_not_found")) {
    return "Um dos produtos da receita não foi encontrado.";
  }
  if (message.includes("invalid_recipe_quantity") || message.includes("duplicate_recipe_product")) {
    return "Revise os produtos e quantidades da receita.";
  }
  if (message.includes("idempotency_key_conflict")) {
    return "Esta tentativa já foi usada com dados diferentes. Recarregue a página e tente novamente.";
  }
  if (message.includes("invalid_idempotency_key")) {
    return "Não foi possível concluir a operação. Recarregue a página e tente novamente.";
  }

  return GENERIC_NOT_FOUND_MESSAGE;
}

function parseIdempotencyKey(formData: FormData): string | null {
  const raw = formData.get("idempotency_key");
  if (typeof raw !== "string") {
    return null;
  }
  const key = raw.trim();
  return key.length >= 8 ? key : null;
}

export async function createServiceAction(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const context = await requirePermission("services.manage");
  const parsed = parseServiceForm(formData);
  const recipes = parseRecipesJson(formData.get("recipes_json"));
  const idempotencyKey = parseIdempotencyKey(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (recipes == null) {
    return { error: "Revise os produtos e quantidades da receita." };
  }

  if (!idempotencyKey) {
    return { error: "Não foi possível concluir a operação. Recarregue a página e tente novamente." };
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
    p_items: recipesToRpcPayload(recipes),
    p_idempotency_key: idempotencyKey,
    p_company_id: context.membership.company.id,
  });

  if (error || !data) {
    return { error: mapRpcError(error) };
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

  const context = await requirePermission("services.manage");
  const parsed = parseServiceForm(formData);
  const recipes = parseRecipesJson(formData.get("recipes_json"));
  const idempotencyKey = parseIdempotencyKey(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (recipes == null) {
    return { error: "Revise os produtos e quantidades da receita." };
  }

  if (!idempotencyKey) {
    return { error: "Não foi possível concluir a operação. Recarregue a página e tente novamente." };
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
    p_items: recipesToRpcPayload(recipes),
    p_idempotency_key: idempotencyKey,
    p_company_id: context.membership.company.id,
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

  const context = await requirePermission("services.manage");
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

  const context = await requirePermission("services.manage");
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
