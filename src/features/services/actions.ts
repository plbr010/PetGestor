"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseServiceForm } from "@/features/services/schemas";
import { sizePricesToRpcPayload } from "@/features/services/utils";
import { parseQuantityInput } from "@/features/inventory/stock-engine";
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

  const message = error.message ?? "";
  if (message.includes("product_not_found")) {
    return "Um dos produtos da receita não foi encontrado.";
  }
  if (message.includes("invalid_recipe_quantity") || message.includes("duplicate_recipe_product")) {
    return "Revise os produtos e quantidades da receita.";
  }

  return GENERIC_NOT_FOUND_MESSAGE;
}

function parseRecipesJson(formData: FormData): { product_id: string; quantity: number }[] | null {
  const raw = formData.get("recipes_json");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const items: { product_id: string; quantity: number }[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") {
        return null;
      }
      const record = row as Record<string, unknown>;
      const productId = String(record.product_id ?? "");
      const quantity =
        typeof record.quantity === "number"
          ? record.quantity
          : parseQuantityInput(String(record.quantity ?? ""));
      if (!isValidUuid(productId) || quantity == null) {
        return null;
      }
      items.push({ product_id: productId, quantity });
    }
    return items;
  } catch {
    return null;
  }
}

async function saveServiceRecipes(serviceId: string, formData: FormData): Promise<string | null> {
  const recipes = parseRecipesJson(formData);
  if (recipes == null) {
    return "Revise os produtos e quantidades da receita.";
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("replace_service_product_recipes", {
    p_service_id: serviceId,
    p_items: recipes,
  });

  if (error) {
    return mapRpcError(error);
  }

  return null;
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

  const recipeError = await saveServiceRecipes(String(data), formData);
  if (recipeError) {
    return { error: recipeError };
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

  const recipeError = await saveServiceRecipes(serviceId, formData);
  if (recipeError) {
    return { error: recipeError };
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
